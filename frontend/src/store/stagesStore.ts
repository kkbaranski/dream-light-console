import { create } from "zustand";

export interface Stage {
  id: string;
  name: string;
  createdAt: string;
}

interface StagesStore {
  stages: Stage[];
  createStage: (name: string) => Stage;
  deleteStage: (id: string) => void;
}

export const useStagesStore = create<StagesStore>((set) => ({
  stages: [],

  createStage: (name) => {
    const stage: Stage = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ stages: [...state.stages, stage] }));
    return stage;
  },

  deleteStage: (id) =>
    set((state) => ({
      stages: state.stages.filter((stage) => stage.id !== id),
    })),
}));
