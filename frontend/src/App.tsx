import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TopBar } from "./components/layout/TopBar";
import { useApi } from "./hooks/useApi";
import { useWebSocket } from "./hooks/useWebSocket";
import { Dashboard } from "./pages/Dashboard";
import { StageEditor } from "./pages/StageEditor";

export function App() {
  useWebSocket();
  useApi();

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen bg-gray-950 text-white">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stage" element={<StageEditor />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
