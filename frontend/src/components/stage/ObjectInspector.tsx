import { useStageEditorStore } from "../../store/stageEditorStore";
import { OBJECT_TYPE_DEFS, type InspectorSectionContext } from "../../scene/objectTypeDefs";
import type { SceneObject, SceneObjectType, ObjectPatch } from "../../scene/types";

function allSameType(objects: SceneObject[]): boolean {
  if (objects.length === 0) return false;
  const firstType = objects[0].type;
  return objects.every((o) => o.type === firstType);
}

function buildContext<T extends SceneObject>(
  selected: T[],
  updateSelected: (patch: Partial<Record<string, unknown>>) => void,
  moveObjects: (movements: { id: string; position: [number, number, number] }[]) => void,
  toggleLock: (id: string, field: string) => void,
): InspectorSectionContext<T> {
  const count = selected.length;

  function shared<V>(getter: (object: T) => V): V | null {
    const values = selected.map(getter);
    return values.every((v) => v === values[0]) ? values[0] : null;
  }

  function isMixed<V>(getter: (object: T) => V): boolean {
    return shared(getter) === null;
  }

  function avgInt(getter: (object: T) => number): number {
    return Math.round(selected.reduce((sum, o) => sum + getter(o), 0) / count);
  }

  function avgFloat(getter: (object: T) => number, decimals = 2): number {
    const sum = selected.reduce((acc, o) => acc + getter(o), 0);
    return parseFloat((sum / count).toFixed(decimals));
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
    update: (patch: ObjectPatch<T>) =>
      updateSelected(patch as Partial<Record<string, unknown>>),
    move: moveObjects,
    isLocked,
    toggleLock: handleToggleLock,
  };
}

export function ObjectInspector() {
  const objects = useStageEditorStore((state) => state.objects);
  const selectedIds = useStageEditorStore((state) => state.selectedIds);
  const updateSelected = useStageEditorStore((state) => state.updateSelected);
  const moveObjects = useStageEditorStore((state) => state.moveObjects);
  const toggleLock = useStageEditorStore((state) => state.toggleLock);

  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.length === 0 || !allSameType(selected)) return null;

  const objectType = selected[0].type as SceneObjectType;
  const def = OBJECT_TYPE_DEFS[objectType] as {
    label: string;
    headerAction?: (ctx: InspectorSectionContext<SceneObject>) => React.ReactNode;
    inspectorSections: ReadonlyArray<{
      key: string;
      render: (ctx: InspectorSectionContext<SceneObject>) => React.ReactNode;
    }>;
  };

  const ctx = buildContext(
    selected as SceneObject[],
    updateSelected,
    moveObjects,
    toggleLock,
  ) as InspectorSectionContext<SceneObject>;

  const count = selected.length;

  return (
    <div className="border-b border-gray-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {count === 1 ? def.label : `${count} ${def.label}s`}
        </span>
        {def.headerAction?.(ctx)}
      </div>

      <div className="px-4 pb-4 flex flex-col gap-1">
        {def.inspectorSections.map((section) => (
          <div key={section.key}>{section.render(ctx)}</div>
        ))}
      </div>
    </div>
  );
}
