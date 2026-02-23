import { create } from "zustand";
import type { Fixture, FixtureCreate, FixtureUpdate } from "../types";
import { api } from "../api/client";

interface StageStore {
  fixtures: Fixture[];
  selectedFixtureId: number | null;
  isLoading: boolean;

  setFixtures: (fixtures: Fixture[]) => void;
  updateFixtureLocal: (id: number, patch: Partial<Fixture>) => void;
  removeFixture: (id: number) => void;
  setSelectedFixtureId: (id: number | null) => void;

  fetchFixtures: () => Promise<void>;
  createFixture: (body: FixtureCreate) => Promise<Fixture>;
  patchFixture: (id: number, body: FixtureUpdate) => Promise<void>;
  deleteFixture: (id: number) => Promise<void>;
}

export const useStageStore = create<StageStore>((set) => ({
  fixtures: [],
  selectedFixtureId: null,
  isLoading: false,

  setFixtures: (fixtures) => set({ fixtures }),

  updateFixtureLocal: (id, patch) =>
    set((s) => ({
      fixtures: s.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),

  removeFixture: (id) =>
    set((s) => ({ fixtures: s.fixtures.filter((f) => f.id !== id) })),

  setSelectedFixtureId: (id) => set({ selectedFixtureId: id }),

  fetchFixtures: async () => {
    set({ isLoading: true });
    try {
      const fixtures = await api.get<Fixture[]>("/fixtures");
      set({ fixtures, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createFixture: async (body) => {
    const fixture = await api.post<Fixture>("/fixtures", body);
    set((s) => ({ fixtures: [...s.fixtures, fixture] }));
    return fixture;
  },

  patchFixture: async (id, body) => {
    const updated = await api.patch<Fixture>(`/fixtures/${id}`, body);
    set((s) => ({
      fixtures: s.fixtures.map((f) => (f.id === id ? updated : f)),
    }));
  },

  deleteFixture: async (id) => {
    await api.del(`/fixtures/${id}`);
    set((s) => ({
      fixtures: s.fixtures.filter((f) => f.id !== id),
      selectedFixtureId: s.selectedFixtureId === id ? null : s.selectedFixtureId,
    }));
  },
}));
