import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CenteredPage, PageLayout } from "../components/layout/PageLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Modal } from "../components/ui/Modal";
import { TrashButton } from "../components/ui/TrashButton";
import {
  useSong,
  useSongVersions,
  useDeleteSongVersion,
  useRecordings,
  useCreateRecording,
  useDeleteRecording,
  songDisplayName,
} from "../api/hooks";
import type { SongVersion, Recording } from "../api/hooks";
import * as React from "react";

function AddRecordingDialog({
  songId,
  versionId,
  onClose,
}: {
  songId: string;
  versionId: string;
  onClose: () => void;
}) {
  const createRecording = useCreateRecording(songId, versionId);
  const [filePath, setFilePath] = useState("");
  const [source, setSource] = useState("");
  const [durationMs, setDurationMs] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!filePath.trim()) return;
    createRecording.mutate(
      {
        file_path: filePath.trim(),
        source: source.trim() || undefined,
        duration_ms: durationMs ? Number(durationMs) : undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-white font-semibold text-base mb-5">
        Add Recording
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          autoFocus
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="File path"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source (optional)"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={durationMs}
          onChange={(e) => setDurationMs(e.target.value)}
          placeholder="Duration in ms (optional)"
          type="number"
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
            disabled={!filePath.trim() || createRecording.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {createRecording.isPending ? "Adding..." : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecordingRow({
  recording,
  songId,
  versionId,
}: {
  recording: Recording;
  songId: string;
  versionId: string;
}) {
  const deleteRecording = useDeleteRecording(songId, versionId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="flex items-center px-4 py-3 hover:bg-gray-800/40 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm truncate">
            {recording.file_path}
          </div>
          <div className="flex gap-3 text-gray-500 text-xs mt-0.5">
            {recording.source && <span>{recording.source}</span>}
            {recording.duration_ms != null && (
              <span>{formatDuration(recording.duration_ms)}</span>
            )}
          </div>
        </div>
        <TrashButton
          onClick={() => setConfirmDelete(true)}
          title="Delete recording"
        />
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Recording"
          message={`Are you sure you want to delete "${recording.file_path}"?`}
          onConfirm={() =>
            deleteRecording.mutate(recording.id, {
              onSuccess: () => setConfirmDelete(false),
            })
          }
          onClose={() => setConfirmDelete(false)}
          isPending={deleteRecording.isPending}
        />
      )}
    </>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SongVersionPage() {
  const { songId, versionId } = useParams<{
    songId: string;
    versionId: string;
  }>();
  const navigate = useNavigate();
  const { data: song } = useSong(songId!);
  const { data: versions } = useSongVersions(songId!);
  const deleteVersion = useDeleteSongVersion(songId!);
  const { data: recordings } = useRecordings(songId!, versionId!);
  const [isAddingRecording, setIsAddingRecording] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const version = versions?.find((songVersion: SongVersion) => String(songVersion.id) === versionId);

  const [name, setName] = useState("");
  const [bpm, setBpm] = useState("");
  const [durationMs, setDurationMs] = useState("");
  const [keySignature, setKeySignature] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (version) {
      setName(version.name);
      setBpm(version.bpm != null ? String(version.bpm) : "");
      setDurationMs(
        version.duration_ms != null ? String(version.duration_ms) : "",
      );
      setKeySignature(version.key_signature);
      setNotes(version.notes);
    }
  }, [version]);

  function handleDelete() {
    if (!versionId) return;
    deleteVersion.mutate(versionId, {
      onSuccess: () => void navigate(`/songs/${songId}`),
    });
  }

  const recordingList = recordings ?? [];

  if (!versions) return <CenteredPage message="Loading..." />;
  if (!version) return <CenteredPage message="Version not found" />;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/songs"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            Songs
          </Link>
          <span className="text-gray-600">/</span>
          <Link
            to={`/songs/${songId}`}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            {song ? songDisplayName(song) : "..."}
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">
            {version.name || "Untitled"}
          </span>
        </div>
        <TrashButton
          onClick={() => setIsConfirmingDelete(true)}
          title="Delete version"
        />
      </div>

      <div className="flex flex-col gap-4 mb-10">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">BPM</label>
            <input
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              type="number"
              step="0.1"
              placeholder="\u2014"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">
              Duration
            </label>
            <div className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-sm">
              {durationMs ? (
                <span className="text-white">
                  {formatDuration(Number(durationMs))}
                </span>
              ) : (
                <span className="text-gray-500">&mdash;</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Key</label>
            <input
              value={keySignature}
              onChange={(e) => setKeySignature(e.target.value)}
              placeholder="\u2014"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-base">Recordings</h2>
        <button
          onClick={() => setIsAddingRecording(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add Recording
        </button>
      </div>

      {recordingList.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <p className="text-gray-500 text-sm">No recordings yet</p>
          <button
            onClick={() => setIsAddingRecording(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add recording
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {recordingList.map((recording) => (
            <RecordingRow
              key={recording.id}
              recording={recording}
              songId={songId!}
              versionId={versionId!}
            />
          ))}
        </div>
      )}

      {isAddingRecording && (
        <AddRecordingDialog
          songId={songId!}
          versionId={versionId!}
          onClose={() => setIsAddingRecording(false)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete Version"
          message={`Are you sure you want to delete "${version.name || "Untitled"}"? This will also permanently remove all its recordings.`}
          onConfirm={handleDelete}
          onClose={() => setIsConfirmingDelete(false)}
          isPending={deleteVersion.isPending}
        />
      )}
    </PageLayout>
  );
}
