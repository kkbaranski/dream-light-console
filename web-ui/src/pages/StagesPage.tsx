import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CenteredPage, PageLayout, EmptyState } from "../components/layout/PageLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Modal } from "../components/ui/Modal";
import { TrashButton } from "../components/ui/TrashButton";
import { useStages, useCreateStage, useDeleteStage } from "../api/hooks";
import type { Stage } from "../api/hooks";
import * as React from "react";

function CreateStageDialog({ onClose }: { onClose: () => void }) {
  const createStage = useCreateStage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createStage.mutate(
      {
        name: name.trim(),
        location_name: locationName.trim() || undefined,
        location_address: locationAddress.trim() || undefined,
      },
      {
        onSuccess: (stage) => {
          onClose();
          void navigate(`/stages/${stage.id}`);
        },
      },
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-white font-semibold text-base mb-5">New Stage</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Stage name"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="Location name (optional)"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
          placeholder="Address (optional)"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
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
            disabled={!name.trim() || createStage.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {createStage.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  const navigate = useNavigate();
  const deleteStage = useDeleteStage();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="flex items-center hover:bg-gray-800/40 transition-colors">
        <button
          onClick={() => void navigate(`/stages/${stage.id}`)}
          className="flex-1 text-left px-4 py-3"
        >
          <span className="text-white text-sm font-medium">{stage.name}</span>
          {stage.location_name && (
            <span className="ml-3 text-gray-500 text-sm">
              {stage.location_name}
            </span>
          )}
        </button>
        <div className="pr-3">
          <TrashButton
            onClick={() => setConfirmDelete(true)}
            title="Delete stage"
          />
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Stage"
          message={`Are you sure you want to delete "${stage.name}"? This cannot be undone.`}
          onConfirm={() =>
            deleteStage.mutate(stage.id, {
              onSuccess: () => setConfirmDelete(false),
            })
          }
          onClose={() => setConfirmDelete(false)}
          isPending={deleteStage.isPending}
        />
      )}
    </>
  );
}

export function StagesPage() {
  const { data: stages, isLoading } = useStages();
  const [isCreating, setIsCreating] = useState(false);

  const stageList = stages ?? [];

  if (isLoading) return <CenteredPage message="Loading stages..." />;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-white font-semibold text-lg">Stages</h1>
        {stageList.length > 0 && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            New Stage
          </button>
        )}
      </div>

      {stageList.length === 0 ? (
        <EmptyState
          message="No stages yet"
          buttonLabel="Create your first stage"
          onAction={() => setIsCreating(true)}
        />
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {stageList.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </div>
      )}

      {isCreating && (
        <CreateStageDialog onClose={() => setIsCreating(false)} />
      )}
    </PageLayout>
  );
}
