import { useStageEditorStore } from "../../store/stageEditorStore";
import { DEVICE_REGISTRY, activeCapabilities } from "../../devices/registry";
import type { InspectorCtx, CapObject, BoundCapability } from "../../devices/capability";
import type { SceneObject } from "../../scene/types";

/** Capabilities present in every selected object (intersection by cap.type). */
function sharedCapabilities(selected: SceneObject[]): ReadonlyArray<BoundCapability> {
  const capSets = selected.map((obj) =>
    activeCapabilities(DEVICE_REGISTRY[obj.type], obj.mode),
  );
  return capSets[0].filter((bound) =>
    capSets.every((set) => set.some((b) => b.cap.type === bound.cap.type)),
  );
}

function buildCtx(
  selected: SceneObject[],
  updateSelected: (patch: Record<string, unknown>) => void,
  moveObjects: (movements: { id: string; position: [number, number, number] }[]) => void,
  toggleLock: (id: string, field: string) => void,
): InspectorCtx {
  const count = selected.length;

  function shared<V,>(getter: (obj: CapObject) => V): V | null {
    const values = selected.map(getter);
    return values.every((v) => v === values[0]) ? values[0] : null;
  }

  return {
    selected,
    shared,
    isMixed: (getter) => shared(getter) === null,
    avgInt:   (getter) => Math.round(selected.reduce((sum, o) => sum + getter(o), 0) / count),
    avgFloat: (getter, decimals = 2) =>
      parseFloat((selected.reduce((acc, o) => acc + getter(o), 0) / count).toFixed(decimals)),
    isLocked: (field) => selected.some((o) => o.lockedFields.includes(field)),
    update: updateSelected,
    move: moveObjects,
    toggleLock: (field) => {
      const anyLocked = selected.some((o) => o.lockedFields.includes(field));
      for (const obj of selected) {
        const hasLock = obj.lockedFields.includes(field);
        if (anyLocked && hasLock)   toggleLock(obj.id, field);
        if (!anyLocked && !hasLock) toggleLock(obj.id, field);
      }
    },
  };
}

export function ObjectInspector() {
  const objects        = useStageEditorStore((state) => state.objects);
  const selectedIds    = useStageEditorStore((state) => state.selectedIds);
  const updateSelected = useStageEditorStore((state) => state.updateSelected);
  const moveObjects    = useStageEditorStore((state) => state.moveObjects);
  const toggleLock     = useStageEditorStore((state) => state.toggleLock);
  const removeObjects  = useStageEditorStore((state) => state.removeObjects);

  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.length === 0) return null;

  const allSameType = selected.every((o) => o.type === selected[0].type);
  const def         = DEVICE_REGISTRY[selected[0].type];
  const count       = selected.length;
  const ctx         = buildCtx(selected, updateSelected, moveObjects, toggleLock);
  const caps        = sharedCapabilities(selected);

  const title = allSameType
    ? count === 1 ? def.label : `${count} ${def.label}s`
    : `${count} Items`;

  const deleteLabel = count === 1
    ? `Delete ${def.label}`
    : allSameType ? `Delete ${count} ${def.label}s` : `Delete ${count} Items`;

  return (
    <div className="border-b border-gray-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {title}
        </span>

        <div className="flex items-center gap-2">
          {caps
            .filter(({ cap }) => cap.headerWidget)
            .map(({ cap, config }) => {
              const Widget = cap.headerWidget!;
              return <Widget key={cap.type} ctx={ctx} config={config} />;
            })}
        </div>
      </div>

      {allSameType && Object.keys(def.modes).length > 1 && (
        <div className="px-4 pb-2">
          <select
            value={selected[0].mode}
            onChange={(e) => ctx.update({ mode: e.target.value })}
            className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
          >
            {Object.entries(def.modes).map(([modeKey, mode]) => (
              <option key={modeKey} value={modeKey}>{mode.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="px-4 flex flex-col gap-1">
        {caps.map(({ cap, config }) => {
          const Inspector = cap.Inspector;
          if (!Inspector) return null;
          return (
            <div key={cap.type}>
              <Inspector ctx={ctx} config={config} />
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3">
        <button
          onClick={() => removeObjects(selectedIds)}
          className="w-full py-1.5 text-xs font-medium rounded border border-red-900/60 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
        >
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}
