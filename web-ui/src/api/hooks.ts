import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  fixtureTypes: ['fixture-types'] as const,
  fixtures: ['fixtures'] as const,
  fixture: (id: string) => ['fixtures', id] as const,
  stages: ['stages'] as const,
  stage: (stageId: string) => ['stages', stageId] as const,
  stageObjects: (stageId: string) => ['stages', stageId, 'objects'] as const,
  songs: ['songs'] as const,
  song: (songId: string) => ['songs', songId] as const,
  songVersions: (songId: string) => ['songs', songId, 'versions'] as const,
  recordings: (songId: string, versionId: string) =>
    ['songs', songId, 'versions', versionId, 'recordings'] as const,
  concertPrograms: ['concert-programs'] as const,
  concerts: ['concerts'] as const,
  cueLists: (concertId: string) => ['concerts', concertId, 'cue-lists'] as const,
};

// ── Fixture Types (read-only from server memory) ─────────────────────────────

export interface FixtureType {
  id: string;
  label: string;
}

export function useFixtureTypes() {
  return useQuery({
    queryKey: queryKeys.fixtureTypes,
    queryFn: () => api.get<FixtureType[]>('/fixture-types'),
    staleTime: Infinity,
  });
}

// ── Fixtures (inventory) ─────────────────────────────────────────────────────

export interface Fixture {
  id: string;
  fixture_type_id: string;
  dmx_mode: string;
  label: string;
  serial_number: string;
  notes: string;
  avatar_path: string;
  default_universe: number;
  default_address: number;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export function useFixtures() {
  return useQuery({
    queryKey: queryKeys.fixtures,
    queryFn: () => api.get<Fixture[]>('/fixtures'),
  });
}

export interface FixtureTypeDetail {
  id: string;
  label: string;
  definition: {
    modes?: Record<string, { label: string }>;
    defaultMode?: string;
    modelPath?: string;
  };
}

export function useFixtureType(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.fixtureTypes, id],
    queryFn: () => api.get<FixtureTypeDetail>(`/fixture-types/${id}`),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useCreateFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      fixture_type_id: string;
      label?: string;
      dmx_mode?: string;
      serial_number?: string;
      notes?: string;
    }) => api.post<Fixture>('/fixtures', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fixtureId, blob }: { fixtureId: string; blob: Blob }) => {
      await api.putBlob(`/fixtures/${fixtureId}/avatar`, blob, blob.type || 'image/jpeg');
      return fixtureId;
    },
    onSuccess: (_data, { fixtureId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixture(fixtureId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fixtureId: string) => api.del(`/fixtures/${fixtureId}/avatar`).then(() => fixtureId),
    onSuccess: (fixtureId: string) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixture(fixtureId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
  });
}

export function useFixture(fixtureId: string) {
  return useQuery({
    queryKey: queryKeys.fixture(fixtureId),
    queryFn: () => api.get<Fixture>(`/fixtures/${fixtureId}`),
    enabled: !!fixtureId,
  });
}

export function useUpdateFixture(fixtureId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      label?: string;
      serial_number?: string;
      notes?: string;
      dmx_mode?: string;
      default_universe?: number;
      default_address?: number;
      config_json?: string;
    }) => api.put<Fixture>(`/fixtures/${fixtureId}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixture(fixtureId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
  });
}

export function useDeleteFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fixtureId: string) => api.del(`/fixtures/${fixtureId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fixtures });
    },
  });
}

// ── Stages ───────────────────────────────────────────────────────────────────

export interface Stage {
  id: string;
  name: string;
  location_name: string;
  location_address: string;
  dimensions_json: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export function useStages() {
  return useQuery({
    queryKey: queryKeys.stages,
    queryFn: () => api.get<Stage[]>('/stages'),
  });
}

export function useStage(stageId: string) {
  return useQuery({
    queryKey: queryKeys.stage(stageId),
    queryFn: () => api.get<Stage>(`/stages/${stageId}`),
    enabled: !!stageId,
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; location_name?: string; location_address?: string }) =>
      api.post<Stage>('/stages', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stages });
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => api.del(`/stages/${stageId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stages });
    },
  });
}

// ── Stage Objects ────────────────────────────────────────────────────────────

export function useStageObjects(stageId: string) {
  return useQuery({
    queryKey: queryKeys.stageObjects(stageId),
    queryFn: () => api.get<unknown[]>(`/stages/${stageId}/objects`),
    enabled: !!stageId,
  });
}

export function useSaveStageObjects(stageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objects: unknown[]) =>
      api.put<void>(`/stages/${stageId}/objects`, objects),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stageObjects(stageId),
      });
    },
  });
}

// ── Songs ────────────────────────────────────────────────────────────────────

export interface Song {
  id: string;
  title: string;
  artist: string;
  tags_json: string;
  notes: string;
}

export function songDisplayName(song: Song): string {
  return song.artist ? `${song.artist} \u2013 ${song.title}` : song.title;
}

export function useSongs() {
  return useQuery({
    queryKey: queryKeys.songs,
    queryFn: () => api.get<Song[]>('/songs'),
  });
}

export function useSong(songId: string) {
  return useQuery({
    queryKey: queryKeys.song(songId),
    queryFn: () => api.get<Song>(`/songs/${songId}`),
    enabled: !!songId,
  });
}

export function useCreateSong() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; artist?: string }) =>
      api.post<Song>('/songs', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.songs });
    },
  });
}

export function useUpdateSong(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title?: string; artist?: string; notes?: string }) =>
      api.put<Song>(`/songs/${songId}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.songs });
      void queryClient.invalidateQueries({ queryKey: queryKeys.song(songId) });
    },
  });
}

export function useDeleteSong() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (songId: string) => api.del(`/songs/${songId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.songs });
    },
  });
}

// ── Song Versions ───────────────────────────────────────────────────────────

export interface SongVersion {
  song_id: string;
  id: number;
  name: string;
  bpm: number | null;
  duration_ms: number | null;
  key_signature: string;
  structure_json: string;
  notes: string;
}

export function useSongVersions(songId: string) {
  return useQuery({
    queryKey: queryKeys.songVersions(songId),
    queryFn: () => api.get<SongVersion[]>(`/songs/${songId}/versions`),
    enabled: !!songId,
  });
}

export function useCreateSongVersion(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; bpm?: number; key_signature?: string }) =>
      api.post<SongVersion>(`/songs/${songId}/versions`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.songVersions(songId) });
    },
  });
}

export function useDeleteSongVersion(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.del(`/songs/${songId}/versions/${versionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.songVersions(songId) });
    },
  });
}

// ── Recordings ──────────────────────────────────────────────────────────────

export interface Recording {
  id: string;
  song_id: string;
  version_id: number;
  file_path: string;
  file_hash: string;
  source: string;
  duration_ms: number | null;
  fingerprint_path: string;
}

export function useRecordings(songId: string, versionId: string) {
  return useQuery({
    queryKey: queryKeys.recordings(songId, versionId),
    queryFn: () =>
      api.get<Recording[]>(`/songs/${songId}/versions/${versionId}/recordings`),
    enabled: !!songId && !!versionId,
  });
}

export function useCreateRecording(songId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { file_path: string; source?: string; duration_ms?: number }) =>
      api.post<Recording>(
        `/songs/${songId}/versions/${versionId}/recordings`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recordings(songId, versionId),
      });
    },
  });
}

export function useDeleteRecording(songId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordingId: string) =>
      api.del(`/songs/${songId}/versions/${versionId}/recordings/${recordingId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recordings(songId, versionId),
      });
    },
  });
}

// ── Concert Programs ─────────────────────────────────────────────────────────

export interface ConcertProgram {
  id: string;
  name: string;
  description: string;
  tags_json: string;
  entries_json: string;
  created_at: string;
  updated_at: string;
}

export function useConcertPrograms() {
  return useQuery({
    queryKey: queryKeys.concertPrograms,
    queryFn: () => api.get<ConcertProgram[]>('/concert-programs'),
  });
}

// ── Concerts ─────────────────────────────────────────────────────────────────

export interface Concert {
  id: string;
  name: string;
  program_id: string | null;
  stage_id: string;
  date: string;
  status: string;
  performers_json: string;
  program_entries_json: string;
  created_at: string;
  updated_at: string;
}

export function useConcerts() {
  return useQuery({
    queryKey: queryKeys.concerts,
    queryFn: () => api.get<Concert[]>('/concerts'),
  });
}

export function useCreateConcert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; stage_id: string; program_id?: string }) =>
      api.post<Concert>('/concerts', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.concerts });
    },
  });
}
