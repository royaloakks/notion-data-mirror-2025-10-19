from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from notion_client import AsyncClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Scheduler for background sync
scheduler = AsyncIOScheduler()

# Define Models
class NotionKeyInput(BaseModel):
    api_key: str

class NotionKeyResponse(BaseModel):
    success: bool
    message: str

class ToggleSyncInput(BaseModel):
    item_id: str
    item_type: str  # 'page' or 'database'
    enabled: bool

class WorkspaceItem(BaseModel):
    id: str
    title: str
    item_type: str
    icon: Optional[str] = None
    synced: bool = False

class SyncedContent(BaseModel):
    id: str
    title: str
    item_type: str
    content: str
    last_synced: str
    url: Optional[str] = None

class SyncResponse(BaseModel):
    success: bool
    message: str
    synced_count: int

# Helper functions
async def get_notion_key():
    config = await db.config.find_one({"type": "notion_key"})
    if not config or not config.get("api_key"):
        return None
    return config["api_key"]

async def extract_text_from_rich_text(rich_text_array):
    if not rich_text_array:
        return ""
    return "".join([rt.get("plain_text", "") for rt in rich_text_array])

async def get_page_title(page_obj):
    properties = page_obj.get("properties", {})
    for prop_name, prop_value in properties.items():
        if prop_value.get("type") == "title":
            title_array = prop_value.get("title", [])
            return await extract_text_from_rich_text(title_array)
    return "Untitled"

async def get_blocks_content(notion: AsyncClient, block_id: str, depth: int = 0) -> str:
    if depth > 5:  # Limit recursion depth
        return ""
    
    try:
        blocks = await notion.blocks.children.list(block_id=block_id)
        content_parts = []
        
        for block in blocks.get("results", []):
            block_type = block.get("type")
            block_content = block.get(block_type, {})
            
            indent = "  " * depth
            
            if block_type == "paragraph":
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                if text:
                    content_parts.append(f"{indent}{text}\n")
            elif block_type in ["heading_1", "heading_2", "heading_3"]:
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                level = block_type[-1]
                content_parts.append(f"{indent}{'#' * int(level)} {text}\n\n")
            elif block_type == "bulleted_list_item":
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                content_parts.append(f"{indent}- {text}\n")
            elif block_type == "numbered_list_item":
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                content_parts.append(f"{indent}1. {text}\n")
            elif block_type == "code":
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                language = block_content.get("language", "")
                content_parts.append(f"{indent}```{language}\n{text}\n```\n\n")
            elif block_type == "quote":
                text = await extract_text_from_rich_text(block_content.get("rich_text", []))
                content_parts.append(f"{indent}> {text}\n\n")
            elif block_type == "image":
                caption = await extract_text_from_rich_text(block_content.get("caption", []))
                url = block_content.get("file", {}).get("url") or block_content.get("external", {}).get("url")
                if url:
                    content_parts.append(f"{indent}![{caption}]({url})\n\n")
            elif block_type == "file":
                caption = await extract_text_from_rich_text(block_content.get("caption", []))
                url = block_content.get("file", {}).get("url") or block_content.get("external", {}).get("url")
                if url:
                    content_parts.append(f"{indent}[File: {caption or 'Attachment'}]({url})\n\n")
            
            # Handle child blocks recursively
            if block.get("has_children"):
                child_content = await get_blocks_content(notion, block["id"], depth + 1)
                content_parts.append(child_content)
        
        return "".join(content_parts)
    except Exception as e:
        logger.error(f"Error getting blocks for {block_id}: {e}")
        return ""

async def sync_page(notion: AsyncClient, page_id: str):
    try:
        page = await notion.pages.retrieve(page_id=page_id)
        title = await get_page_title(page)
        content = await get_blocks_content(notion, page_id)
        
        # Mark as permission error if content is empty
        has_permission_error = len(content.strip()) == 0
        
        await db.synced_pages.update_one(
            {"id": page_id},
            {"$set": {
                "id": page_id,
                "title": title,
                "content": content,
                "last_synced": datetime.now(timezone.utc).isoformat(),
                "url": page.get("url"),
                "has_permission_error": has_permission_error
            }},
            upsert=True
        )
        return True
    except Exception as e:
        logger.error(f"Error syncing page {page_id}: {e}")
        return False

async def extract_property_value(prop_value):
    """Extract readable value from a Notion property"""
    prop_type = prop_value.get("type")
    
    if prop_type == "title":
        return await extract_text_from_rich_text(prop_value.get("title", []))
    elif prop_type == "rich_text":
        return await extract_text_from_rich_text(prop_value.get("rich_text", []))
    elif prop_type == "number":
        return str(prop_value.get("number", ""))
    elif prop_type == "select":
        select = prop_value.get("select")
        return select.get("name", "") if select else ""
    elif prop_type == "multi_select":
        items = prop_value.get("multi_select", [])
        return ", ".join([item.get("name", "") for item in items])
    elif prop_type == "date":
        date_obj = prop_value.get("date")
        if date_obj:
            start = date_obj.get("start", "")
            end = date_obj.get("end", "")
            return f"{start} to {end}" if end else start
        return ""
    elif prop_type == "people":
        people = prop_value.get("people", [])
        return ", ".join([person.get("name", "") for person in people])
    elif prop_type == "url":
        return prop_value.get("url", "")
    elif prop_type == "email":
        return prop_value.get("email", "")
    elif prop_type == "phone_number":
        return prop_value.get("phone_number", "")
    elif prop_type == "checkbox":
        return "Yes" if prop_value.get("checkbox") else "No"
    elif prop_type == "status":
        status = prop_value.get("status")
        return status.get("name", "") if status else ""
    elif prop_type == "files":
        files = prop_value.get("files", [])
        return ", ".join([f.get("name", "") for f in files])
    else:
        return ""

async def sync_database(notion: AsyncClient, database_id: str):
    try:
        database = await notion.databases.retrieve(database_id=database_id)
        title_array = database.get("title", [])
        title = await extract_text_from_rich_text(title_array)
        
        # Get database properties schema
        db_properties = database.get("properties", {})
        
        # Query database entries with pagination
        entries = []
        has_more = True
        start_cursor = None
        
        while has_more:
            query_params = {"database_id": database_id}
            if start_cursor:
                query_params["start_cursor"] = start_cursor
            
            results = await notion.databases.query(**query_params)
            
            for page in results.get("results", []):
                entry_title = await get_page_title(page)
                entry_parts = [f"### {entry_title}\n"]
                
                # Extract all properties
                properties = page.get("properties", {})
                property_lines = []
                
                for prop_name, prop_value in properties.items():
                    if prop_value.get("type") != "title":  # Skip title as we already have it
                        value = await extract_property_value(prop_value)
                        if value:
                            property_lines.append(f"- **{prop_name}**: {value}")
                
                if property_lines:
                    entry_parts.append("\n".join(property_lines))
                    entry_parts.append("\n\n")
                
                # Get block content if any
                entry_content = await get_blocks_content(notion, page["id"])
                if entry_content.strip():
                    entry_parts.append(entry_content)
                
                entry_parts.append("\n")
                entries.append("".join(entry_parts))
            
            # Check pagination
            has_more = results.get("has_more", False)
            start_cursor = results.get("next_cursor")
        
        content = "\n".join(entries) if entries else "No entries in this database."
        
        await db.synced_databases.update_one(
            {"id": database_id},
            {"$set": {
                "id": database_id,
                "title": title,
                "content": content,
                "last_synced": datetime.now(timezone.utc).isoformat(),
                "url": database.get("url")
            }},
            upsert=True
        )
        return True
    except Exception as e:
        logger.error(f"Error syncing database {database_id}: {e}")
        return False

async def perform_sync():
    """Background sync job"""
    try:
        api_key = await get_notion_key()
        if not api_key:
            return
        
        notion = AsyncClient(auth=api_key)
        
        # Get all enabled sync selections
        selections = await db.sync_selections.find({"enabled": True}).to_list(1000)
        
        for selection in selections:
            if selection["item_type"] == "page":
                await sync_page(notion, selection["item_id"])
            elif selection["item_type"] == "database":
                await sync_database(notion, selection["item_id"])
        
        logger.info(f"Auto-sync completed: {len(selections)} items synced")
    except Exception as e:
        logger.error(f"Error in auto-sync: {e}")

# API Routes
@api_router.post("/notion/save-key", response_model=NotionKeyResponse)
async def save_notion_key(input: NotionKeyInput):
    try:
        # Test the key by making a simple API call
        notion = AsyncClient(auth=input.api_key)
        await notion.search(query="", page_size=1)
        
        # Save to database
        await db.config.update_one(
            {"type": "notion_key"},
            {"$set": {"type": "notion_key", "api_key": input.api_key}},
            upsert=True
        )
        
        return NotionKeyResponse(success=True, message="Notion API key saved successfully")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Notion API key: {str(e)}")

@api_router.get("/notion/workspace", response_model=List[WorkspaceItem])
async def get_workspace_items():
    api_key = await get_notion_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Notion API key not configured")
    
    try:
        notion = AsyncClient(auth=api_key)
        results = await notion.search(query="", page_size=100)
        
        items = []
        for result in results.get("results", []):
            item_type = result.get("object")
            item_id = result.get("id")
            
            # Get title
            if item_type == "page":
                title = await get_page_title(result)
            elif item_type == "database":
                title_array = result.get("title", [])
                title = await extract_text_from_rich_text(title_array)
            else:
                continue
            
            # Check if synced
            selection = await db.sync_selections.find_one({"item_id": item_id})
            synced = selection.get("enabled", False) if selection else False
            
            icon = None
            if result.get("icon") and result["icon"].get("type") == "emoji":
                icon = result["icon"].get("emoji")
            
            items.append(WorkspaceItem(
                id=item_id,
                title=title,
                item_type=item_type,
                icon=icon,
                synced=synced
            ))
        
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching workspace: {str(e)}")

@api_router.post("/notion/toggle-sync")
async def toggle_sync(input: ToggleSyncInput):
    try:
        await db.sync_selections.update_one(
            {"item_id": input.item_id},
            {"$set": {
                "item_id": input.item_id,
                "item_type": input.item_type,
                "enabled": input.enabled
            }},
            upsert=True
        )
        return {"success": True, "message": "Sync preference updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating sync preference: {str(e)}")

@api_router.post("/notion/sync", response_model=SyncResponse)
async def manual_sync():
    api_key = await get_notion_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Notion API key not configured")
    
    try:
        notion = AsyncClient(auth=api_key)
        selections = await db.sync_selections.find({"enabled": True}).to_list(1000)
        
        synced_count = 0
        for selection in selections:
            if selection["item_type"] == "page":
                success = await sync_page(notion, selection["item_id"])
            elif selection["item_type"] == "database":
                success = await sync_database(notion, selection["item_id"])
            else:
                success = False
            
            if success:
                synced_count += 1
        
        return SyncResponse(
            success=True,
            message=f"Sync completed successfully",
            synced_count=synced_count
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during sync: {str(e)}")

@api_router.get("/notion/content", response_model=List[SyncedContent])
async def get_synced_content():
    try:
        pages = await db.synced_pages.find({}, {"_id": 0}).to_list(1000)
        databases = await db.synced_databases.find({}, {"_id": 0}).to_list(1000)
        
        content = []
        
        for page in pages:
            content.append(SyncedContent(
                id=page["id"],
                title=page["title"],
                item_type="page",
                content=page["content"],
                last_synced=page["last_synced"],
                url=page.get("url")
            ))
        
        for database in databases:
            content.append(SyncedContent(
                id=database["id"],
                title=database["title"],
                item_type="database",
                content=database["content"],
                last_synced=database["last_synced"],
                url=database.get("url")
            ))
        
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching content: {str(e)}")

@api_router.get("/notion/status")
async def get_status():
    api_key = await get_notion_key()
    has_key = api_key is not None
    
    synced_pages_count = await db.synced_pages.count_documents({})
    synced_databases_count = await db.synced_databases.count_documents({})
    
    # Count items with permission errors (empty content)
    empty_pages = await db.synced_pages.count_documents({"$expr": {"$lt": [{"$strLenCP": "$content"}, 10]}})
    empty_databases = await db.synced_databases.count_documents({"$expr": {"$lt": [{"$strLenCP": "$content"}, 50]}})
    
    # Get last sync time
    last_sync = None
    latest_page = await db.synced_pages.find_one({}, sort=[("last_synced", -1)])
    latest_db = await db.synced_databases.find_one({}, sort=[("last_synced", -1)])
    
    if latest_page or latest_db:
        page_time = latest_page.get("last_synced") if latest_page else ""
        db_time = latest_db.get("last_synced") if latest_db else ""
        last_sync = max(page_time, db_time) if page_time and db_time else (page_time or db_time)
    
    # Get enabled sync count
    enabled_syncs = await db.sync_selections.count_documents({"enabled": True})
    
    return {
        "has_key": has_key,
        "synced_pages": synced_pages_count,
        "synced_databases": synced_databases_count,
        "total_synced": synced_pages_count + synced_databases_count,
        "last_sync": last_sync,
        "enabled_syncs": enabled_syncs,
        "items_with_errors": empty_pages + empty_databases
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    # Start background sync job (every 4 hours)
    scheduler.add_job(perform_sync, 'interval', hours=4, id='notion_sync')
    scheduler.start()
    logger.info("Background sync scheduler started")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()