import { create } from "zustand";
import { floorMaterials, wallMaterials } from "../materials/registry";

export interface PlacedLight {
  id: string;
  type: "moving_head";
  name: string;
  position: [number, number, number];
  rotationX: number;  // degrees -180 to 180
  rotationY: number;
  rotationZ: number;
  universe: number;
  startChannel: number;
  dimmer: number;     // 0–255
  pan: number;        // 0–255
  tilt: number;       // 0–255
  color: string;      // "#rrggbb"
  coneAngle: number;  // beam half-angle in degrees
  powered: boolean;
  lockedFields: string[];
}

type NewLightParams = Pick<PlacedLight, "id" | "type" | "position">;
type LightPatch = Partial<Omit<PlacedLight, "id" | "type">>;

const PASTE_OFFSET: [number, number, number] = [2, 0, 2];

function generateCopyName(originName: string, existingNames: Set<string>): string {
  const baseName = `Copy of ${originName}`;
  if (!existingNames.has(baseName)) return baseName;
  for (let n = 2; ; n++) {
    const candidate = `${baseName} (${n})`;
    if (!existingNames.has(candidate)) return candidate;
  }
}

// Applies a patch to a light, skipping fields listed in lockedFields.
// Position axes are handled separately via moveLights.
function applyPatchRespectingLocks(light: PlacedLight, patch: LightPatch): PlacedLight {
  const filtered = Object.fromEntries(
    (Object.keys(patch) as (keyof LightPatch)[]).filter((key) => !light.lockedFields.includes(key as string)).map((key) => [key, patch[key]]),
  ) as LightPatch;
  return { ...light, ...filtered };
}

interface StageEditorStore {
  floorMaterialId: string;
  wallMaterialId: string;
  floorTileSize: number;
  wallTileSize: number;
  stageModelId: string | null;
  placedLights: PlacedLight[];
  selectedLightIds: string[];
  clipboard: PlacedLight[] | null;
  setFloorMaterial: (id: string) => void;
  setWallMaterial: (id: string) => void;
  setFloorTileSize: (size: number) => void;
  setWallTileSize: (size: number) => void;
  setStageModel: (id: string | null) => void;
  addLight: (params: NewLightParams) => void;
  removeLight: (id: string) => void;
  updateLight: (id: string, patch: LightPatch) => void;
  updateSelectedLights: (patch: LightPatch) => void;
  moveLights: (movements: { id: string; position: [number, number, number] }[]) => void;
  setSelectedLight: (id: string | null) => void;
  addToSelection: (id: string) => void;
  toggleSelectedLight: (id: string) => void;
  copySelectedLights: () => void;
  pasteLights: () => void;
  toggleLock: (id: string, field: string) => void;
}

export const useStageEditorStore = create<StageEditorStore>((set) => ({
  floorMaterialId: floorMaterials[0].id,
  wallMaterialId: wallMaterials[0].id,
  floorTileSize: 1,
  wallTileSize: 1,
  stageModelId: null,
  placedLights: [],
  selectedLightIds: [],
  clipboard: null,
  setFloorMaterial: (id) => set({ floorMaterialId: id }),
  setWallMaterial: (id) => set({ wallMaterialId: id }),
  setFloorTileSize: (size) => set({ floorTileSize: size }),
  setWallTileSize: (size) => set({ wallTileSize: size }),
  setStageModel: (id) => set({ stageModelId: id }),
  addLight: (params) =>
    set((state) => {
      const count =
        state.placedLights.filter((light) => light.type === params.type).length + 1;
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
            powered: true,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            lockedFields: [],
            ...params,
          },
        ],
      };
    }),
  removeLight: (id) =>
    set((state) => ({
      placedLights: state.placedLights.filter((light) => light.id !== id),
      selectedLightIds: state.selectedLightIds.filter((selectedId) => selectedId !== id),
    })),
  updateLight: (id, patch) =>
    set((state) => ({
      placedLights: state.placedLights.map((light) =>
        light.id === id ? { ...light, ...patch } : light,
      ),
    })),
  updateSelectedLights: (patch) =>
    set((state) => ({
      placedLights: state.placedLights.map((light) =>
        state.selectedLightIds.includes(light.id)
          ? applyPatchRespectingLocks(light, patch)
          : light,
      ),
    })),
  moveLights: (movements) =>
    set((state) => {
      const positionById = new Map(movements.map((movement) => [movement.id, movement.position]));
      return {
        placedLights: state.placedLights.map((light) => {
          const newPos = positionById.get(light.id);
          if (!newPos) return light;
          const locked = light.lockedFields;
          const position: [number, number, number] = [
            locked.includes("posX") ? light.position[0] : newPos[0],
            locked.includes("posY") ? light.position[1] : newPos[1],
            locked.includes("posZ") ? light.position[2] : newPos[2],
          ];
          return { ...light, position };
        }),
      };
    }),
  setSelectedLight: (id) => set({ selectedLightIds: id === null ? [] : [id] }),
  addToSelection: (id) =>
    set((state) => ({
      selectedLightIds: state.selectedLightIds.includes(id)
        ? state.selectedLightIds
        : [...state.selectedLightIds, id],
    })),
  toggleSelectedLight: (id) =>
    set((state) => ({
      selectedLightIds: state.selectedLightIds.includes(id)
        ? state.selectedLightIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedLightIds, id],
    })),
  copySelectedLights: () =>
    set((state) => ({
      clipboard: state.placedLights.filter((light) =>
        state.selectedLightIds.includes(light.id),
      ),
    })),
  pasteLights: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.length === 0) return {};
      const existingNames = new Set(state.placedLights.map((light) => light.name));
      const newLights = state.clipboard.map((light) => {
        const name = generateCopyName(light.name, existingNames);
        existingNames.add(name);
        return {
          ...light,
          id: crypto.randomUUID(),
          name,
          position: [
            light.position[0] + PASTE_OFFSET[0],
            light.position[1] + PASTE_OFFSET[1],
            light.position[2] + PASTE_OFFSET[2],
          ] as [number, number, number],
        };
      });
      return {
        placedLights: [...state.placedLights, ...newLights],
        selectedLightIds: newLights.map((light) => light.id),
      };
    }),
  toggleLock: (id, field) =>
    set((state) => ({
      placedLights: state.placedLights.map((light) => {
        if (light.id !== id) return light;
        return {
          ...light,
          lockedFields: light.lockedFields.includes(field)
            ? light.lockedFields.filter((f) => f !== field)
            : [...light.lockedFields, field],
        };
      }),
    })),
}));
