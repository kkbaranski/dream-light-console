import { useStageEditorStore } from "../../store/stageEditorStore";
import { OBJECT_TYPE_DEFS, type InspectorSectionContext } from "../../scene/objectTypeDefs";
import type { SceneObject, SceneObjectType } from "../../scene/types";

function allSameType(objects: SceneObject[]): boolean {
  if (objects.length === 0) return false;
  return objects.every((o) => o.type === objects[0].type);
}

function buildContext(
  selected: SceneObject[],
  updateSelected: (patch: Record<string, unknown>) => void,
  moveObjects: (movements: { id: string; position: [number, number, number] }[]) => void,
  toggleLock: (id: string, field: string) => void,
): InspectorSectionContext {
  const count = selected.length;

  function shared<V>(getter: (object: SceneObject) => V): V | null {
    const values = selected.map(getter);
    return values.every((v) => v === values[0]) ? values[0] : null;
  }

  function isMixed<V>(getter: (object: SceneObject) => V): boolean {
    return shared(getter) === null;
  }

  function avgInt(getter: (object: SceneObject) => number): number {
    return Math.round(selected.reduce((sum, o) => sum + getter(o), 0) / count);
  }

  function avgFloat(getter: (object: SceneObject) => number, decimals = 2): number {
    return parseFloat((selected.reduce((acc, o) => acc + getter(o), 0) / count).toFixed(decimals));
  }

  function isLocked(field: string): boolean {
    return selected.some((o) => o.lockedFields.includes(field));
  }

  function handleToggleLock(field: string) {
    const anyLocked = isLocked(field);
    for (const object of selected) {
      const hasLock = object.lockedFields.includes(field);
      if (anyLocked && hasLock) toggleLock(object.id, field);
      else if (!anyLocked && !hasLock) toggleLock(object.id, field);
    }
  }

  return {
    selected,
    shared,
    isMixed,
    avgInt,
    avgFloat,
    update: updateSelected,
    move: moveObjects,
    isLocked,
    toggleLock: handleToggleLock,
  };
}

export function ObjectInspector() {
  const objects       = useStageEditorStore((state) => state.objects);
  const selectedIds   = useStageEditorStore((state) => state.selectedIds);
  const updateSelected = useStageEditorStore((state) => state.updateSelected);
  const moveObjects   = useStageEditorStore((state) => state.moveObjects);
  const toggleLock    = useStageEditorStore((state) => state.toggleLock);
  const removeObjects = useStageEditorStore((state) => state.removeObjects);

  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.length === 0 || !allSameType(selected)) return null;

  const objectType = selected[0].type as SceneObjectType;
  const def = OBJECT_TYPE_DEFS[objectType];
  const ctx = buildContext(selected, updateSelected, moveObjects, toggleLock);
  const count = selected.length;

  return (
    <div className="border-b border-gray-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {count === 1 ? def.label : `${count} ${def.label}s`}
        </span>
        {def.headerAction?.(ctx)}
      </div>

      <div className="px-4 flex flex-col gap-1">
        {def.inspectorSections.map((section) => (
          <div key={section.key}>{section.render(ctx)}</div>
        ))}
      </div>

      <div className="px-4 py-3">
        <button
          onClick={() => removeObjects(selectedIds)}
          className="w-full py-1.5 text-xs font-medium rounded border border-red-900/60 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
        >
          {count === 1 ? `Delete ${def.label}` : `Delete ${count} items`}
        </button>
      </div>
    </div>
  );
}
