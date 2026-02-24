import { create } from "zustand";
import { floorMaterials, wallMaterials } from "../materials/registry";

export interface PlacedLight {
  id: string;
  type: "moving_head";
  name: string;
  position: [number, number, number];
  universe: number;
  startChannel: number;
  dimmer: number;     // 0–255
  pan: number;        // 0–255
  tilt: number;       // 0–255
  color: string;      // "#rrggbb"
  coneAngle: number;  // beam half-angle in degrees
}

type NewLightParams = Pick<PlacedLight, "id" | "type" | "position">;

interface StageEditorStore {
  floorMaterialId: string;
  wallMaterialId: string;
  floorTileSize: number;
  wallTileSize: number;
  stageModelId: string | null;
  placedLights: PlacedLight[];
  selectedLightId: string | null;
  setFloorMaterial: (id: string) => void;
  setWallMaterial: (id: string) => void;
  setFloorTileSize: (size: number) => void;
  setWallTileSize: (size: number) => void;
  setStageModel: (id: string | null) => void;
  addLight: (params: NewLightParams) => void;
  removeLight: (id: string) => void;
  updateLight: (id: string, patch: Partial<Omit<PlacedLight, "id" | "type">>) => void;
  setSelectedLight: (id: string | null) => void;
}

export const useStageEditorStore = create<StageEditorStore>((set) => ({
  floorMaterialId: floorMaterials[0].id,
  wallMaterialId: wallMaterials[0].id,
  floorTileSize: 1,
  wallTileSize: 1,
  stageModelId: null,
  placedLights: [],
  selectedLightId: null,
  setFloorMaterial: (id) => set({ floorMaterialId: id }),
  setWallMaterial: (id) => set({ wallMaterialId: id }),
  setFloorTileSize: (size) => set({ floorTileSize: size }),
  setWallTileSize: (size) => set({ wallTileSize: size }),
  setStageModel: (id) => set({ stageModelId: id }),
  addLight: (params) =>
    set((state) => {
      const count =
        state.placedLights.filter((l) => l.type === params.type).length + 1;
      return {
        placedLights: [
          ...state.placedLights,
          {
            name: `Moving Head ${count}`,
            universe: 1,
            startChannel: 1,
            dimmer: 255,
            pan: 128,
            tilt: 128,
            color: "#ffffff",
            coneAngle: 15,
            ...params,
          },
        ],
      };
    }),
  removeLight: (id) =>
    set((state) => ({
      placedLights: state.placedLights.filter((l) => l.id !== id),
      selectedLightId:
        state.selectedLightId === id ? null : state.selectedLightId,
    })),
  updateLight: (id, patch) =>
    set((state) => ({
      placedLights: state.placedLights.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    })),
  setSelectedLight: (id) => set({ selectedLightId: id }),
}));
