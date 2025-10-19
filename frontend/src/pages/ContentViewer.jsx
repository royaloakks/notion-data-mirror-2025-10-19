import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import axios from "axios";
import { API } from "@/App";
import { ArrowLeft, Search, FileText, Database, ExternalLink, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from 'react-markdown';

export default function ContentViewer() {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/notion/content`);
      setContent(response.data);
    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContent = content.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            data-testid="back-to-dashboard-button"
            onClick={() => navigate('/dashboard')}
            variant="ghost"
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-2">Synced Content</h1>
          <p className="text-slate-600">All your synced Notion content in one place - ChatGPT can read this!</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              data-testid="content-search-input"
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base border-2"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-600">Loading content...</div>
        ) : content.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-slate-600 mb-4">No synced content yet</p>
              <Button onClick={() => navigate('/dashboard')} className="bg-gradient-to-r from-blue-500 to-teal-500">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Content List */}
            <div className="lg:col-span-1">
              <Card className="border-0 shadow-lg sticky top-6">
                <CardHeader>
                  <CardTitle>Items ({filteredContent.length})</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[calc(100vh-200px)] overflow-y-auto">
                  <div className="space-y-2">
                    {filteredContent.map((item) => (
                      <div
                        key={item.id}
                        data-testid={`content-item-${item.id}`}
                        onClick={() => setSelectedItem(item)}
                        className={`p-3 rounded-lg cursor-pointer hover:bg-slate-100 ${
                          selectedItem?.id === item.id ? 'bg-blue-50 border-2 border-blue-300' : 'border border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {item.item_type === 'page' ? (
                            <FileText className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                          ) : (
                            <Database className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-800 truncate">{item.title}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <p className="text-xs text-slate-500">{formatDate(item.last_synced)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Content Detail */}
            <div className="lg:col-span-2">
              {selectedItem ? (
                <Card className="border-0 shadow-xl" data-testid="content-detail-card">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-2xl">{selectedItem.title}</CardTitle>
                          {selectedItem.url && (
                            <a
                              href={selectedItem.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={selectedItem.item_type === 'page' ? 'default' : 'secondary'}>
                            {selectedItem.item_type}
                          </Badge>
                          <p className="text-sm text-slate-500">Last synced: {formatDate(selectedItem.last_synced)}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-6">
                    {selectedItem.content ? (
                      <div className="prose prose-slate max-w-none">
                        <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                          <ReactMarkdown>{selectedItem.content}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 max-w-2xl mx-auto">
                          <p className="text-amber-900 font-medium mb-2">⚠️ No Content Available</p>
                          <p className="text-sm text-amber-800 mb-3">
                            This item appears to be a <strong>database view or linked database</strong> rather than a regular page. 
                            It may show up in your workspace but doesn't have readable block content.
                          </p>
                          <p className="text-sm text-amber-700">
                            <strong>Tip:</strong> If this is a database, look for the actual database entry (not the view) 
                            in your workspace list and sync that instead.
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-12 pb-12 text-center">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">Select an item to view its content</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ChatGPT Instructions */}
        {content.length > 0 && (
          <Card className="mt-8 border-2 border-teal-200 bg-teal-50">
            <CardHeader>
              <CardTitle className="text-teal-900">💡 Using with ChatGPT</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-teal-800 mb-3">
                To query this content with ChatGPT, tell it to browse this URL:
              </p>
              <div className="bg-white p-3 rounded border border-teal-300 font-mono text-sm break-all">
                {window.location.origin}/notion-content
              </div>
              <p className="text-sm text-teal-700 mt-3">
                This public page is optimized for ChatGPT to read without JavaScript. ChatGPT will be able to read all your synced Notion content and answer questions about it!
              </p>
              <p className="text-xs text-teal-600 mt-2">
                💡 <strong>Example prompt:</strong> "Browse {window.location.origin}/notion-content and tell me about [your question]"
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}