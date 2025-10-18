import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import axios from "axios";
import { API } from "@/App";
import { Link2, CheckCircle2, AlertCircle } from "lucide-react";

export default function Setup({ onSetupComplete }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      await axios.post(`${API}/notion/save-key`, { api_key: apiKey });
      setSuccess(true);
      setTimeout(() => {
        onSetupComplete();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save API key. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-teal-500 rounded-2xl mb-4 shadow-lg">
            <Link2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-800 mb-3">Notion ChatGPT Bridge</h1>
          <p className="text-lg text-slate-600">Connect your Notion workspace to make it accessible to ChatGPT</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Connect Your Notion Workspace</CardTitle>
            <CardDescription className="text-base">
              Get started by providing your Notion integration token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="api-key" className="text-sm font-medium">Notion API Key</Label>
                <Input
                  id="api-key"
                  data-testid="notion-api-key-input"
                  type="password"
                  placeholder="ntn_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                  className="h-12 text-base"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">How to get your API key:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                  <li>Visit <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">notion.so/my-integrations</a></li>
                  <li>Click "+ New integration"</li>
                  <li>Give it a name and select your workspace</li>
                  <li>Copy the "Internal Integration Token"</li>
                  <li>Share pages/databases with the integration in Notion</li>
                </ol>
              </div>

              {error && (
                <Alert variant="destructive" data-testid="error-alert">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-50 text-green-900 border-green-200" data-testid="success-alert">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>API key saved successfully! Redirecting...</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                data-testid="save-api-key-button"
                disabled={loading || !apiKey}
                className="w-full h-12 text-base bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-600 hover:to-teal-600"
              >
                {loading ? "Connecting..." : "Connect Workspace"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Your API key is stored securely and only used to sync your Notion content</p>
        </div>
      </div>
    </div>
  );
}