import { useStageEditorStore } from "../../store/stageEditorStore";
import { DEVICE_REGISTRY, activeFeatures } from "../../devices/registry";
import { FEATURE_CATEGORIES } from "../../devices/feature";
import type { InspectorCtx, FeatureObject, BoundFeature } from "../../devices/feature";
import { CategorySection } from "./inspectorPrimitives";
import type { SceneObject } from "../../scene/types";

/** Features present in every selected object (intersection by feature.type). */
function sharedFeatures(selected: SceneObject[]): ReadonlyArray<BoundFeature> {
  const featureSets = selected.map((obj) =>
    activeFeatures(DEVICE_REGISTRY[obj.type], obj.mode),
  );
  return featureSets[0].filter((bound) =>
    featureSets.every((set) => set.some((b) => b.feature.type === bound.feature.type)),
  );
}

function buildCtx(
  selected: SceneObject[],
  updateSelected: (patch: Record<string, unknown>) => void,
  moveObjects: (movements: { id: string; position: [number, number, number] }[]) => void,
  toggleLock: (id: string, field: string) => void,
): InspectorCtx {
  const count = selected.length;

  function shared<V,>(getter: (obj: FeatureObject) => V): V | null {
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
  const features    = sharedFeatures(selected);

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
          {features
            .filter(({ feature }) => feature.headerWidget)
            .map(({ feature, config }) => {
              const Widget = feature.headerWidget!;
              return <Widget key={feature.type} ctx={ctx} config={config} />;
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
        {features
          .filter((b) => !FEATURE_CATEGORIES.some((c) => c.features.includes(b.feature.type)))
          .map(({ feature, config }) => {
            const Inspector = feature.Inspector;
            if (!Inspector) return null;
            return (
              <div key={feature.type}>
                <Inspector ctx={ctx} config={config} />
              </div>
            );
          })}

        {FEATURE_CATEGORIES.map((cat) => {
          const catFeatures = features.filter((b) => {
            if (!cat.features.includes(b.feature.type)) return false;
            if (b.feature.type === "beam" && !(b.config as { coneAngle?: unknown }).coneAngle) return false;
            return true;
          });
          if (catFeatures.length === 0) return null;
          return (
            <CategorySection
              key={cat.key}
              label={cat.label}
              locked={ctx.isLocked(`cat:${cat.key}`)}
              onToggleLock={() => ctx.toggleLock(`cat:${cat.key}`)}
            >
              {catFeatures.map(({ feature, config }) => {
                const Inspector = feature.Inspector;
                if (!Inspector) return null;
                return (
                  <div key={feature.type}>
                    <Inspector ctx={ctx} config={config} />
                  </div>
                );
              })}
            </CategorySection>
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
