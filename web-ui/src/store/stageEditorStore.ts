import { create } from "zustand";
import { floorMaterials, wallMaterials } from "../materials/registry";
import { DEVICE_REGISTRY, activeCapabilities } from "../devices/registry";
import type { SceneObject, SceneObjectType } from "../scene/types";

export type { SceneObject };
export type { SceneObjectType } from "../devices/registry";

// ── Patch type ─────────────────────────────────────────────────────────────────
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
    Object.entries(patch).filter(([key]) => !locked.includes(key)),
  );
  return { ...(object as unknown as Record<string, unknown>), ...filtered } as unknown as SceneObject;
}

// ── Object construction ────────────────────────────────────────────────────────

function buildNewObject(
  id: string,
  type: SceneObjectType,
  position: [number, number, number],
  existingObjects: SceneObject[],
): SceneObject {
  const def  = DEVICE_REGISTRY[type];
  const mode = def.defaultMode;
  const caps = activeCapabilities(def, mode);

  // Gather defaults from every capability in the starting mode.
  const capabilityDefaults: Record<string, unknown> = {};
  for (const { cap, config } of caps) {
    Object.assign(capabilityDefaults, cap.defaultState(config));
  }

  // Auto-number the name when the device has one (e.g. "Moving Head" → "Moving Head 3").
  if (typeof capabilityDefaults.name === "string") {
    const count = existingObjects.filter((object) => object.type === type).length + 1;
    capabilityDefaults.name = `${capabilityDefaults.name} ${count}`;
  }

  return {
    id,
    type,
    position,
    lockedFields: [],
    mode,
    ...capabilityDefaults,
  } as unknown as SceneObject;
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
  clipboard: SceneObject[];
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
  clipboard: [],
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
        (o) => state.selectedIds.includes(o.id) && DEVICE_REGISTRY[o.type].supportsCopyPaste,
      ),
    })),
  paste: () =>
    set((state) => {
      if (state.clipboard.length === 0) return {};

      const existingNames = new Set<string>(
        state.objects.flatMap((o) => {
          const n = (o as unknown as Record<string, unknown>).name;
          return typeof n === "string" ? [n] : [];
        }),
      );

      const newObjects: SceneObject[] = state.clipboard.map((original) => {
        const raw = original as unknown as Record<string, unknown>;
        const copy: Record<string, unknown> = { ...raw };
        copy.id = crypto.randomUUID();
        copy.position = [
          original.position[0] + PASTE_OFFSET[0],
          original.position[1] + PASTE_OFFSET[1],
          original.position[2] + PASTE_OFFSET[2],
        ];
        if (typeof raw.name === "string") {
          const newName = generateCopyName(raw.name, existingNames);
          existingNames.add(newName);
          copy.name = newName;
        }
        return copy as unknown as SceneObject;
      });

      return {
        ...pushHistory(state, { objects: [...state.objects, ...newObjects] }),
        selectedIds: newObjects.map((o) => o.id),
      };
    }),
  // ── Lock ───────────────────────────────────────────────────────────────────
  toggleLock: (id, field) =>
    set((state) =>
      pushHistory(state, {
        objects: state.objects.map((object) => {
          if (object.id !== id) return object;
          return {
            ...(object as unknown as Record<string, unknown>),
            lockedFields: object.lockedFields.includes(field)
              ? object.lockedFields.filter((f) => f !== field)
              : [...object.lockedFields, field],
          } as unknown as SceneObject;
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
