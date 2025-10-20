import json
import os

# Ensure the site directory exists
os.makedirs("site", exist_ok=True)

# Load the Notion export JSON
with open("data/notion_export.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# Generate a simple HTML page listing the contents
html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notion Export</title>
</head>
<body>
    <h1>Notion Export Snapshot</h1>
    <pre>{json_dump}</pre>
</body>
</html>
"""

# Convert the JSON data to a pretty-printed string
json_dump = json.dumps(data, indent=2, ensure_ascii=False)

# Write the HTML file
with open("site/index.html", "w", encoding="utf-8") as f:
    f.write(html_content.format(json_dump=json_dump))
