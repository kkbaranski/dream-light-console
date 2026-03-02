import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStagesStore } from "../store/stagesStore";
import { Sidebar } from "../components/layout/Sidebar";
import type { Stage } from "../store/stagesStore";
import * as React from "react";

function CreateStageDialog({ onClose }: { onClose: () => void }) {
  const createStage = useStagesStore((state) => state.createStage);
  const navigate = useNavigate();
  const [name, setName] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const stage = createStage(name);
    onClose();
    void navigate(`/stages/${stage.id}`);
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdropClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-96 p-6">
        <h2 className="text-white font-semibold text-base mb-5">New Stage</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Stage name"
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => void navigate(`/stages/${stage.id}`)}
      className="group text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-all duration-150"
    >
      <div className="text-3xl mb-4 text-gray-600 group-hover:text-gray-400 transition-colors">
        ◫
      </div>
      <div className="text-white font-medium text-sm mb-1 truncate">{stage.name}</div>
      <div className="text-gray-600 text-xs">
        {new Date(stage.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </div>
    </button>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="text-7xl text-gray-800">◫</div>
      <p className="text-gray-500 text-sm">No stages yet</p>
      <button
        onClick={onCreateClick}
        className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Create your first stage
      </button>
    </div>
  );
}

export function StagesPage() {
  const stages = useStagesStore((state) => state.stages);
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            {stages.length > 0 && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                New Stage
              </button>
            )}
          </div>

          {stages.length === 0 ? (
            <EmptyState onCreateClick={() => setIsCreating(true)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {stages.map((stage) => (
                <StageCard key={stage.id} stage={stage} />
              ))}
            </div>
          )}
        </div>
      </main>

      {isCreating && <CreateStageDialog onClose={() => setIsCreating(false)} />}
    </div>
  );
}
