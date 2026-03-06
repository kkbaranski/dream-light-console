import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { StageScene } from "../components/stage/StageScene";
import { MaterialPanel } from "../components/stage/MaterialPanel";
import { useStage, useSaveStageObjects } from "../api/hooks";
import { useStageEditorStore } from "../store/stageEditorStore";

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

function useAutoSave(stageId: string) {
  const save = useSaveStageObjects(stageId);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unsub = useStageEditorStore.subscribe((state, prev) => {
      if (state.objects === prev.objects || state._historyPaused) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => save.mutate(state.objects as unknown[]), 2000);
    });
    return () => { unsub(); clearTimeout(timerRef.current); };
  }, [save]);
}

export function StageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: stage, isLoading, isError } = useStage(id ?? "");

  useAutoSave(id ?? "");

  if (isLoading) {
    return (
      <div className="flex flex-1 h-full">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading stage...</p>
        </main>
      </div>
    );
  }

  if (isError || !stage) return <StageNotFound />;

  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <div className="flex flex-1 overflow-hidden relative">
        <button
          onClick={() => void navigate("/stages")}
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center text-lg"
          title="Back to stages"
        >
          &larr;
        </button>
        <StageScene />
        <MaterialPanel />
      </div>
    </div>
  );
}
