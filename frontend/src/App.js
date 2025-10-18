import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import ContentViewer from "@/pages/ContentViewer";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

function App() {
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await axios.get(`${API}/notion/status`);
      setHasKey(response.data.has_key);
    } catch (error) {
      console.error("Error checking status:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={hasKey ? <Navigate to="/dashboard" /> : <Navigate to="/setup" />}
          />
          <Route path="/setup" element={<Setup onSetupComplete={() => setHasKey(true)} />} />
          <Route path="/dashboard" element={hasKey ? <Dashboard /> : <Navigate to="/setup" />} />
          <Route path="/content" element={hasKey ? <ContentViewer /> : <Navigate to="/setup" />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;