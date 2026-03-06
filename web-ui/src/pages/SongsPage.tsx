import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CenteredPage, PageLayout, EmptyState } from "../components/layout/PageLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Modal } from "../components/ui/Modal";
import { TrashButton } from "../components/ui/TrashButton";
import {
  useSongs,
  useCreateSong,
  useDeleteSong,
  useSongVersions,
  songDisplayName,
} from "../api/hooks";
import type { Song, SongVersion } from "../api/hooks";
import * as React from "react";

function CreateSongDialog({ onClose }: { onClose: () => void }) {
  const createSong = useCreateSong();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    createSong.mutate(
      { title: title.trim(), artist: artist.trim() || undefined },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-white font-semibold text-base mb-5">New Song</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song title"
          className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist (optional)"
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
            disabled={!title.trim() || createSong.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {createSong.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function VersionsList({ songId }: { songId: string }) {
  const { data: versions, isLoading } = useSongVersions(songId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="bg-gray-950/50 border-t border-gray-800 px-4 py-2">
        <p className="text-gray-500 text-xs pl-6">Loading...</p>
      </div>
    );
  }

  const list = versions ?? [];
  if (list.length === 0) {
    return (
      <div className="bg-gray-950/50 border-t border-gray-800 px-4 py-2">
        <p className="text-gray-500 text-xs pl-6">No versions</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-950/50 border-t border-gray-800">
      {list.map((version: SongVersion) => (
        <button
          key={version.id}
          onClick={() =>
            void navigate(`/songs/${songId}/versions/${version.id}`)
          }
          className="w-full text-left pl-10 pr-4 py-2 text-xs text-gray-400 hover:text-blue-300 hover:bg-gray-800/40 transition-colors flex items-center gap-2"
        >
          <span className="text-gray-600">~</span>
          <span>{version.name || "Untitled version"}</span>
          {version.bpm != null && (
            <span className="text-gray-600">{version.bpm} BPM</span>
          )}
          {version.key_signature && (
            <span className="text-gray-600">{version.key_signature}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SongRow({
  song,
  expanded,
  onToggle,
}: {
  song: Song;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const deleteSong = useDeleteSong();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="border-b border-gray-800 last:border-b-0">
        <div className="flex items-center hover:bg-gray-800/40 transition-colors">
          <button
            onClick={onToggle}
            className="px-3 py-3 text-gray-500 hover:text-gray-300 text-xs"
          >
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
          <button
            onClick={() => void navigate(`/songs/${song.id}`)}
            className="flex-1 text-left py-3"
          >
            <span className="text-white text-sm font-medium">
              {songDisplayName(song)}
            </span>
          </button>
          <div className="pr-3">
            <TrashButton
              onClick={() => setConfirmDelete(true)}
              title="Delete song"
            />
          </div>
        </div>
        {expanded && <VersionsList songId={song.id} />}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Song"
          message={`Are you sure you want to delete "${songDisplayName(song)}"? This will also remove all its versions and recordings.`}
          onConfirm={() =>
            deleteSong.mutate(song.id, {
              onSuccess: () => setConfirmDelete(false),
            })
          }
          onClose={() => setConfirmDelete(false)}
          isPending={deleteSong.isPending}
        />
      )}
    </>
  );
}

export function SongsPage() {
  const { data: songs, isLoading } = useSongs();
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  const songList = songs ?? [];

  if (isLoading) return <CenteredPage message="Loading songs..." />;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-white font-semibold text-lg">Songs</h1>
        {songList.length > 0 && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            New Song
          </button>
        )}
      </div>

      {songList.length === 0 ? (
        <EmptyState
          icon={<div className="text-5xl text-gray-800">&#9835;</div>}
          message="No songs yet"
          buttonLabel="Create your first song"
          onAction={() => setIsCreating(true)}
        />
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {songList.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              expanded={expandedSongId === song.id}
              onToggle={() =>
                setExpandedSongId(
                  expandedSongId === song.id ? null : song.id,
                )
              }
            />
          ))}
        </div>
      )}

      {isCreating && <CreateSongDialog onClose={() => setIsCreating(false)} />}
    </PageLayout>
  );
}
