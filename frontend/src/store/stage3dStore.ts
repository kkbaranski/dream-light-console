import { create } from "zustand";

export type Stage3DObjectType =
  | "moving_head"
  | "par_can"
  | "led_bar"
  | "stage_platform"
  | "truss_beam"
  | "smoke_machine";

export interface Stage3DObject {
  id: string;
  type: Stage3DObjectType;
  name: string;
  position: [number, number, number];
  rotationY: number; // degrees
  // shape props (type-dependent)
  width?: number;    // stage_platform X
  depth?: number;    // stage_platform Z
  thickness?: number; // stage_platform height
  length?: number;   // truss_beam, led_bar
  segments?: number; // led_bar
  // DMX (light types only)
  universe?: number;
  startChannel?: number;
  fixtureType?: string; // fixture registry key: "generic", "rgb", "moving_head"
}

interface Stage3DStore {
  objects: Stage3DObject[];
  selectedObjectId: string | null;
  addObject: (obj: Stage3DObject) => void;
  removeObject: (id: string) => void;
  updateObject: (id: string, patch: Partial<Stage3DObject>) => void;
  selectObject: (id: string | null) => void;
}

export const useStage3DStore = create<Stage3DStore>((set) => ({
  objects: [],
  selectedObjectId: null,
  addObject: (obj) =>
    set((s) => ({ objects: [...s.objects, obj] })),
  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedObjectId: null,
    })),
  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  selectObject: (id) => set({ selectedObjectId: id }),
}));
