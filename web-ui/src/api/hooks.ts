import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  shows: ['shows'] as const,
  show: (id: string) => ['shows', id] as const,
  stages: (showId: string) => ['shows', showId, 'stages'] as const,
  stage: (stageId: string) => ['stages', stageId] as const,
  stageObjects: (stageId: string) => ['stages', stageId, 'objects'] as const,
  fixtureLibrary: ['fixture-library'] as const,
  presets: ['presets'] as const,
  cueLists: ['cue-lists'] as const,
};

export interface Show {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useShows() {
  return useQuery({
    queryKey: queryKeys.shows,
    queryFn: () => api.get<Show[]>('/shows'),
  });
}

export function useCreateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Show>('/shows', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.shows });
    },
  });
}

export interface Stage {
  id: string;
  show_id: string;
  name: string;
  floor_material_id: string;
  wall_material_id: string;
  floor_tile_size: number;
  wall_tile_size: number;
  stage_model_id: string | null;
  created_at: string;
}

export function useStages(showId: string) {
  return useQuery({
    queryKey: queryKeys.stages(showId),
    queryFn: () => api.get<Stage[]>(`/shows/${showId}/stages`),
    enabled: !!showId,
  });
}

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

export function useFixtureLibrary() {
  return useQuery({
    queryKey: queryKeys.fixtureLibrary,
    queryFn: () => api.get<unknown[]>('/fixtures/library'),
    staleTime: Infinity,
  });
}
