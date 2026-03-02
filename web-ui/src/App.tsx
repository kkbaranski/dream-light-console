import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TopBar } from "./components/layout/TopBar";
import { useApi } from "./hooks/useApi";
import { useWebSocket } from "./hooks/useWebSocket";
import { StagesPage } from "./pages/StagesPage";
import { StageEditorPage } from "./pages/StageEditorPage";

export function App() {
  useWebSocket();
  useApi();

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen bg-gray-950 text-white">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/stages" replace />} />
            <Route path="/stages" element={<StagesPage />} />
            <Route path="/stages/:id" element={<StageEditorPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
