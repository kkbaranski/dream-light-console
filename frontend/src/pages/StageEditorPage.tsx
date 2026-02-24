import { useParams } from "react-router-dom";
import { useStagesStore } from "../store/stagesStore";
import { Sidebar } from "../components/layout/Sidebar";
import { StageScene } from "../components/stage/StageScene";
import { MaterialPanel } from "../components/stage/MaterialPanel";

function StageNotFound() {
  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Stage not found</p>
      </main>
    </div>
  );
}

export function StageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const stage = useStagesStore((state) => state.stages.find((s) => s.id === id));

  if (!stage) return <StageNotFound />;

  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <div className="flex flex-1 overflow-hidden">
        <StageScene />
        <MaterialPanel />
      </div>
    </div>
  );
}
