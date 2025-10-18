import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import axios from "axios";
import { API } from "@/App";
import { RefreshCw, FileText, Database, Eye, CheckCircle2, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState({});
  const [filter, setFilter] = useState("all"); // all, page, database
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, statusRes] = await Promise.all([
        axios.get(`${API}/notion/workspace`),
        axios.get(`${API}/notion/status`)
      ]);
      setItems(itemsRes.data);
      setStatus(statusRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load workspace data");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSync = async (itemId, itemType, currentState) => {
    try {
      await axios.post(`${API}/notion/toggle-sync`, {
        item_id: itemId,
        item_type: itemType,
        enabled: !currentState
      });
      
      setItems(items.map(item => 
        item.id === itemId ? { ...item, synced: !currentState } : item
      ));
      
      toast.success(!currentState ? "Added to sync" : "Removed from sync");
    } catch (error) {
      console.error("Error toggling sync:", error);
      toast.error("Failed to update sync preference");
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const response = await axios.post(`${API}/notion/sync`);
      toast.success(`Synced ${response.data.synced_count} items successfully`);
      await fetchData();
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const syncedItems = items.filter(item => item.synced);
  const filteredItems = filter === "all" 
    ? items 
    : items.filter(item => item.item_type === filter);
  
  const formatLastSync = (isoString) => {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
              <Link2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Notion Sync Dashboard</h1>
              <p className="text-slate-600">Manage your Notion workspace sync preferences</p>
              {status.last_sync && (
                <p className="text-sm text-slate-500">Last sync: {formatLastSync(status.last_sync)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Sources</p>
                  <p className="text-2xl font-bold text-slate-800">{items.length}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Sources Selected</p>
                  <p className="text-2xl font-bold text-slate-800">{syncedItems.length}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-teal-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Readable Sources</p>
                  <p className="text-2xl font-bold text-slate-800">{status.total_synced || 0}</p>
                </div>
                <Database className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Button
            data-testid="sync-now-button"
            onClick={handleManualSync}
            disabled={syncing || syncedItems.length === 0}
            className="bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-600 hover:to-teal-600"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>

          <Button
            data-testid="view-content-button"
            onClick={() => navigate('/content')}
            variant="outline"
            disabled={status.total_synced === 0}
            className="border-2 border-slate-300 hover:bg-slate-100"
          >
            <Eye className="w-4 h-4 mr-2" />
            View Content
          </Button>
        </div>

        {/* Items List */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Your Notion Workspace</CardTitle>
            <CardDescription className="text-base">
              Toggle the switch to include pages and databases in sync
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-600">Loading workspace items...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600 mb-2">No items found</p>
                <p className="text-sm text-slate-500">Make sure you've shared pages/databases with your integration</p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <Separator />}
                    <div
                      data-testid={`workspace-item-${item.id}`}
                      className="flex items-center justify-between py-4 px-2 hover:bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {item.item_type === 'page' ? (
                          <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        ) : (
                          <Database className="w-5 h-5 text-purple-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.icon && <span className="text-lg">{item.icon}</span>}
                            <p className="font-medium text-slate-800 truncate">{item.title}</p>
                          </div>
                          <Badge variant="outline" className="mt-1">
                            {item.item_type}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        data-testid={`toggle-sync-${item.id}`}
                        checked={item.synced}
                        onCheckedChange={() => handleToggleSync(item.id, item.item_type, item.synced)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {syncedItems.length > 0 && (
          <div className="mt-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
            <p className="text-sm text-teal-800">
              <strong>Auto-sync enabled:</strong> Your selected items will automatically sync every 4 hours.
              You can also trigger manual sync anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}