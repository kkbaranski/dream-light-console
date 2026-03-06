import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CenteredPage, PageLayout } from "../components/layout/PageLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Modal } from "../components/ui/Modal";
import { TrashButton } from "../components/ui/TrashButton";
import {
  useSong,
  useUpdateSong,
  useDeleteSong,
  useSongVersions,
  useCreateSongVersion,
  useDeleteSongVersion,
  songDisplayName,
} from "../api/hooks";
import type { SongVersion } from "../api/hooks";
import * as React from "react";

function CreateVersionDialog({
  songId,
  onClose,
}: {
  songId: string;
  onClose: () => void;
}) {
  const createVersion = useCreateSongVersion(songId);
  const [name, setName] = useState("");
  const [bpm, setBpm] = useState("");
  const [keySignature, setKeySignature] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createVersion.mutate(
      {
        name: name.trim(),
        bpm: bpm ? Number(bpm) : undefined,
        key_signature: keySignature.trim() || undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-white font-semibold text-base mb-5">
        New Version
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Version name"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          placeholder="BPM (optional)"
          type="number"
          step="0.1"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={keySignature}
          onChange={(e) => setKeySignature(e.target.value)}
          placeholder="Key signature (optional)"
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
            disabled={!name.trim() || createVersion.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {createVersion.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function VersionRow({
  version,
  songId,
}: {
  version: SongVersion;
  songId: string;
}) {
  const navigate = useNavigate();
  const deleteVersion = useDeleteSongVersion(songId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="flex items-center hover:bg-gray-800/40 transition-colors">
        <button
          onClick={() =>
            void navigate(`/songs/${songId}/versions/${version.id}`)
          }
          className="flex-1 text-left px-4 py-3"
        >
          <span className="text-white text-sm font-medium">
            {version.name || "Untitled version"}
          </span>
          <span className="ml-3 text-gray-500 text-xs">
            {[
              version.bpm != null ? `${version.bpm} BPM` : null,
              version.key_signature || null,
            ]
              .filter(Boolean)
              .join(" \u00B7 ")}
          </span>
        </button>
        <div className="pr-3">
          <TrashButton
            onClick={() => setConfirmDelete(true)}
            title="Delete version"
          />
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Version"
          message={`Are you sure you want to delete "${version.name || "Untitled"}"? This will also remove all its recordings.`}
          onConfirm={() =>
            deleteVersion.mutate(String(version.id), {
              onSuccess: () => setConfirmDelete(false),
            })
          }
          onClose={() => setConfirmDelete(false)}
          isPending={deleteVersion.isPending}
        />
      )}
    </>
  );
}

export function SongPage() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const { data: song, isLoading } = useSong(songId!);
  const { data: versions } = useSongVersions(songId!);
  const updateSong = useUpdateSong(songId!);
  const deleteSong = useDeleteSong();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (song) {
      setTitle(song.title);
      setArtist(song.artist);
    }
  }, [song]);

  function handleSave() {
    if (!title.trim()) return;
    updateSong.mutate({ title: title.trim(), artist: artist.trim() });
  }

  function handleDelete() {
    if (!songId) return;
    deleteSong.mutate(songId, {
      onSuccess: () => void navigate("/songs"),
    });
  }

  const versionList = versions ?? [];

  if (isLoading) return <CenteredPage message="Loading..." />;
  if (!song) return <CenteredPage message="Song not found" />;

  const hasChanges = title !== song.title || artist !== song.artist;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/songs"
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          &larr; Back to Songs
        </Link>
        <TrashButton
          onClick={() => setIsConfirmingDelete(true)}
          title="Delete song"
        />
      </div>

      <div className="flex flex-col gap-4 mb-10">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">
            Artist
          </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
        {hasChanges && (
          <div>
            <button
              onClick={handleSave}
              disabled={!title.trim() || updateSong.isPending}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {updateSong.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-base">Versions</h2>
        {versionList.length > 0 && (
          <button
            onClick={() => setIsCreatingVersion(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            New Version
          </button>
        )}
      </div>

      {versionList.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-gray-500 text-sm">No versions yet</p>
          <button
            onClick={() => setIsCreatingVersion(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create version
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {versionList.map((version) => (
            <VersionRow key={version.id} version={version} songId={songId!} />
          ))}
        </div>
      )}

      {isCreatingVersion && (
        <CreateVersionDialog
          songId={songId!}
          onClose={() => setIsCreatingVersion(false)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete Song"
          message={`Are you sure you want to delete "${songDisplayName(song)}"? This will also permanently remove all its versions and recordings.`}
          onConfirm={handleDelete}
          onClose={() => setIsConfirmingDelete(false)}
          isPending={deleteSong.isPending}
        />
      )}
    </PageLayout>
  );
}
