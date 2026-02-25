import { create } from "zustand";
import { floorMaterials, wallMaterials } from "../materials/registry";
import {
  type SceneObject,
  type SceneObjectType,
  type LightObject,
  isLight,
} from "../scene/types";

export type { SceneObject, LightObject };
export {
  isLight,
  isProp,
  isTripod,
} from "../scene/types";

// ── Patch type ─────────────────────────────────────────────────────────────────
// Loose internal patch type; type safety is enforced at the context level.
type LoosePatch = Partial<Record<string, unknown>>;

// ── Paste offset ───────────────────────────────────────────────────────────────
const PASTE_OFFSET: [number, number, number] = [2, 0, 2];
const MAX_HISTORY = 100;

function generateCopyName(originName: string, existingNames: Set<string>): string {
  const baseName = `Copy of ${originName}`;
  if (!existingNames.has(baseName)) return baseName;
  for (let n = 2; ; n++) {
    const candidate = `${baseName} (${n})`;
    if (!existingNames.has(candidate)) return candidate;
  }
}

function applyPatchRespectingLocks(object: SceneObject, patch: LoosePatch): SceneObject {
  const locked = object.lockedFields;
  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !locked.includes(key) && key in object),
  );
  return { ...object, ...filtered } as SceneObject;
}

// ── Defaults per type ──────────────────────────────────────────────────────────

function buildNewObject(
  id: string,
  type: SceneObjectType,
  position: [number, number, number],
  existingObjects: SceneObject[],
): SceneObject {
  if (type === "moving_head") {
    const count = existingObjects.filter(isLight).length + 1;
    return {
      id,
      type,
      position,
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
    };
  }
  if (type === "tripod") {
    return { id, type, position, height: 0, lockedFields: [] };
  }
  if (type === "tripod_with_bar") {
    return { id, type, position, height: 0, lockedFields: [] };
  }
  // speaker_1 | speaker_2 | mic | barricade | disco_ball | disco_ball2
  return { id, type, position, lockedFields: [] } as SceneObject;
}

// ── History snapshot ───────────────────────────────────────────────────────────

interface HistorySnapshot {
  objects: SceneObject[];
  floorMaterialId: string;
  wallMaterialId: string;
  floorTileSize: number;
  wallTileSize: number;
  stageModelId: string | null;
}

function snapshotFrom(state: StageEditorStore): HistorySnapshot {
  return {
    objects: state.objects,
    floorMaterialId: state.floorMaterialId,
    wallMaterialId: state.wallMaterialId,
    floorTileSize: state.floorTileSize,
    wallTileSize: state.wallTileSize,
    stageModelId: state.stageModelId,
  };
}

function snapshotChanged(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return (
    a.objects !== b.objects ||
    a.floorMaterialId !== b.floorMaterialId ||
    a.wallMaterialId !== b.wallMaterialId ||
    a.floorTileSize !== b.floorTileSize ||
    a.wallTileSize !== b.wallTileSize ||
    a.stageModelId !== b.stageModelId
  );
}

function pushHistory(
  state: StageEditorStore,
  patch: Partial<HistorySnapshot>,
): Partial<StageEditorStore> {
  const newValues = { ...snapshotFrom(state), ...patch };
  if (state._historyPaused) {
    return newValues;
  }
  return {
    ...newValues,
    _past: [...state._past.slice(-(MAX_HISTORY - 1)), snapshotFrom(state)],
    _future: [],
  };
}

// ── Store interface ────────────────────────────────────────────────────────────

interface AddObjectParams {
  id: string;
  type: SceneObjectType;
  position: [number, number, number];
}

interface StageEditorStore {
  // ── Scene ──────────────────────────────────────────────────────────────────
  floorMaterialId: string;
  wallMaterialId: string;
  floorTileSize: number;
  wallTileSize: number;
  stageModelId: string | null;
  // ── Objects ────────────────────────────────────────────────────────────────
  objects: SceneObject[];
  selectedIds: string[];
  clipboard: LightObject[] | null;
  // ── History (internal) ─────────────────────────────────────────────────────
  _past: HistorySnapshot[];
  _future: HistorySnapshot[];
  _historyPaused: boolean;
  _prePauseSnapshot: HistorySnapshot | null;
  // ── Scene actions ──────────────────────────────────────────────────────────
  setFloorMaterial: (id: string) => void;
  setWallMaterial: (id: string) => void;
  setFloorTileSize: (size: number) => void;
  setWallTileSize: (size: number) => void;
  setStageModel: (id: string | null) => void;
  // ── Object actions ─────────────────────────────────────────────────────────
  addObject: (params: AddObjectParams) => void;
  removeObjects: (ids: string[]) => void;
  updateObject: (id: string, patch: LoosePatch) => void;
  updateSelected: (patch: LoosePatch) => void;
  moveObjects: (movements: { id: string; position: [number, number, number] }[]) => void;
  // ── Selection actions ──────────────────────────────────────────────────────
  setSelected: (id: string | null) => void;
  addToSelection: (id: string) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  // ── Clipboard ──────────────────────────────────────────────────────────────
  copySelected: () => void;
  paste: () => void;
  // ── Lock ───────────────────────────────────────────────────────────────────
  toggleLock: (id: string, field: string) => void;
  // ── Undo / Redo ────────────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  _pauseHistory: () => void;
  _resumeHistory: () => void;
}

export const useStageEditorStore = create<StageEditorStore>((set) => ({
  // ── Scene ──────────────────────────────────────────────────────────────────
  floorMaterialId: floorMaterials[0].id,
  wallMaterialId: wallMaterials[0].id,
  floorTileSize: 1,
  wallTileSize: 1,
  stageModelId: null,
  // ── Objects ────────────────────────────────────────────────────────────────
  objects: [],
  selectedIds: [],
  clipboard: null,
  // ── History ────────────────────────────────────────────────────────────────
  _past: [],
  _future: [],
  _historyPaused: false,
  _prePauseSnapshot: null,
  // ── Scene actions ──────────────────────────────────────────────────────────
  setFloorMaterial: (id) => set((state) => pushHistory(state, { floorMaterialId: id })),
  setWallMaterial: (id) => set((state) => pushHistory(state, { wallMaterialId: id })),
  setFloorTileSize: (size) => set((state) => pushHistory(state, { floorTileSize: size })),
  setWallTileSize: (size) => set((state) => pushHistory(state, { wallTileSize: size })),
  setStageModel: (id) => set((state) => pushHistory(state, { stageModelId: id })),
  // ── Object actions ─────────────────────────────────────────────────────────
  addObject: ({ id, type, position }) =>
    set((state) => {
      const newObject = buildNewObject(id, type, position, state.objects);
      return pushHistory(state, { objects: [...state.objects, newObject] });
    }),
  removeObjects: (ids) =>
    set((state) => ({
      ...pushHistory(state, { objects: state.objects.filter((o) => !ids.includes(o.id)) }),
      selectedIds: state.selectedIds.filter((sid) => !ids.includes(sid)),
    })),
  updateObject: (id, patch) =>
    set((state) =>
      pushHistory(state, {
        objects: state.objects.map((o) =>
          o.id === id ? applyPatchRespectingLocks(o, patch) : o,
        ),
      }),
    ),
  updateSelected: (patch) =>
    set((state) =>
      pushHistory(state, {
        objects: state.objects.map((o) =>
          state.selectedIds.includes(o.id)
            ? applyPatchRespectingLocks(o, patch)
            : o,
        ),
      }),
    ),
  moveObjects: (movements) =>
    set((state) => {
      const positionById = new Map(movements.map((m) => [m.id, m.position]));
      const newObjects = state.objects.map((object) => {
        const newPos = positionById.get(object.id);
        if (!newPos) return object;
        const locked = object.lockedFields;
        const position: [number, number, number] = [
          locked.includes("posX") ? object.position[0] : newPos[0],
          locked.includes("posY") ? object.position[1] : newPos[1],
          locked.includes("posZ") ? object.position[2] : newPos[2],
        ];
        return { ...object, position };
      });
      return pushHistory(state, { objects: newObjects });
    }),
  // ── Selection actions ──────────────────────────────────────────────────────
  setSelected: (id) => set({ selectedIds: id === null ? [] : [id] }),
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds
        : [...state.selectedIds, id],
    })),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  // ── Clipboard ──────────────────────────────────────────────────────────────
  copySelected: () =>
    set((state) => ({
      clipboard: state.objects.filter(
        (o) => state.selectedIds.includes(o.id) && isLight(o),
      ) as LightObject[],
    })),
  paste: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.length === 0) return {};
      const existingNames = new Set(
        state.objects.filter(isLight).map((l) => (l as LightObject).name),
      );
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
        ...pushHistory(state, { objects: [...state.objects, ...newLights] }),
        selectedIds: newLights.map((l) => l.id),
      };
    }),
  // ── Lock ───────────────────────────────────────────────────────────────────
  toggleLock: (id, field) =>
    set((state) =>
      pushHistory(state, {
        objects: state.objects.map((object) => {
          if (object.id !== id) return object;
          return {
            ...object,
            lockedFields: object.lockedFields.includes(field)
              ? object.lockedFields.filter((f) => f !== field)
              : [...object.lockedFields, field],
          };
        }),
      }),
    ),
  // ── Undo / Redo ────────────────────────────────────────────────────────────
  undo: () =>
    set((state) => {
      if (state._past.length === 0) return {};
      const previous = state._past[state._past.length - 1];
      return {
        ...previous,
        _past: state._past.slice(0, -1),
        _future: [snapshotFrom(state), ...state._future].slice(0, MAX_HISTORY),
      };
    }),
  redo: () =>
    set((state) => {
      if (state._future.length === 0) return {};
      const next = state._future[0];
      return {
        ...next,
        _past: [...state._past.slice(-(MAX_HISTORY - 1)), snapshotFrom(state)],
        _future: state._future.slice(1),
      };
    }),
  // ── History pause/resume ────────────────────────────────────────────────────
  _pauseHistory: () =>
    set((state) => ({
      _historyPaused: true,
      _prePauseSnapshot: snapshotFrom(state),
    })),
  _resumeHistory: () =>
    set((state) => {
      const snap = state._prePauseSnapshot;
      const changed = snap !== null && snapshotChanged(snap, snapshotFrom(state));
      return {
        _historyPaused: false,
        _prePauseSnapshot: null,
        ...(changed && {
          _past: [...state._past.slice(-(MAX_HISTORY - 1)), snap!],
          _future: [],
        }),
      };
    }),
}));
