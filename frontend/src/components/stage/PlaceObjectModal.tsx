import { useState } from "react";
import type { Stage3DObject, Stage3DObjectType } from "../../store/stage3dStore";
import { getCatalogItem } from "./catalog";
import { getAllFixtureDefs, getFixtureDef } from "../../fixtures/registry";
import { Button } from "../ui/Button";

const LIGHT_TYPES: Stage3DObjectType[] = ["moving_head", "par_can", "led_bar"];

interface PlaceObjectModalProps {
  type: Stage3DObjectType;
  dropPosition: [number, number, number];
  onConfirm: (obj: Stage3DObject) => void;
  onCancel: () => void;
}

export function PlaceObjectModal({
  type,
  dropPosition,
  onConfirm,
  onCancel,
}: PlaceObjectModalProps) {
  const catalogItem = getCatalogItem(type);
  const isLight = LIGHT_TYPES.includes(type);

  const [name, setName] = useState(catalogItem.label);
  const [elevation, setElevation] = useState(
    String(catalogItem.defaultElevation),
  );
  const [universe, setUniverse] = useState("1");
  const [startChannel, setStartChannel] = useState("1");
  const [fixtureType, setFixtureType] = useState(
    type === "moving_head" ? "moving_head" : type === "led_bar" ? "rgb" : "generic",
  );
  const [width, setWidth] = useState(
    String(catalogItem.defaults.width ?? 2),
  );
  const [depth, setDepth] = useState(
    String(catalogItem.defaults.depth ?? 2),
  );
  const [thickness, setThickness] = useState(
    String(catalogItem.defaults.thickness ?? 0.4),
  );
  const [length, setLength] = useState(
    String(catalogItem.defaults.length ?? 1.5),
  );
  const [segments, setSegments] = useState(
    String(catalogItem.defaults.segments ?? 5),
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const elev = parseFloat(elevation);
    if (isNaN(elev)) {
      setError("Elevation must be a number.");
      return;
    }

    const obj: Stage3DObject = {
      id: crypto.randomUUID(),
      type,
      name: name.trim(),
      position: [dropPosition[0], elev, dropPosition[2]],
      rotationY: 0,
    };

    if (isLight) {
      const u = parseInt(universe, 10);
      const sc = parseInt(startChannel, 10);
      if (isNaN(u) || u < 1) { setError("Universe must be ≥ 1."); return; }
      if (isNaN(sc) || sc < 1 || sc > 512) { setError("Start channel must be 1–512."); return; }
      obj.universe = u;
      obj.startChannel = sc;
      obj.fixtureType = fixtureType;
    }

    if (type === "stage_platform") {
      const w = parseFloat(width);
      const d = parseFloat(depth);
      const t = parseFloat(thickness);
      if (isNaN(w) || w <= 0) { setError("Width must be > 0."); return; }
      if (isNaN(d) || d <= 0) { setError("Depth must be > 0."); return; }
      if (isNaN(t) || t <= 0) { setError("Thickness must be > 0."); return; }
      obj.width = w;
      obj.depth = d;
      obj.thickness = t;
    }

    if (type === "truss_beam") {
      const l = parseFloat(length);
      if (isNaN(l) || l <= 0) { setError("Length must be > 0."); return; }
      obj.length = l;
    }

    if (type === "led_bar") {
      const l = parseFloat(length);
      const seg = parseInt(segments, 10);
      if (isNaN(l) || l <= 0) { setError("Length must be > 0."); return; }
      if (isNaN(seg) || seg < 1) { setError("Segments must be ≥ 1."); return; }
      obj.length = l;
      obj.segments = seg;
    }

    onConfirm(obj);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onCancel();
  }

  const inputCls =
    "bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500";
  const labelCls = "flex flex-col gap-1";
  const labelTextCls = "text-gray-400 text-xs";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdropClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">
            Place {catalogItem.label}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2.5"
        >
          {/* Name — always */}
          <label className={labelCls}>
            <span className={labelTextCls}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </label>

          {/* Y Elevation — always */}
          <label className={labelCls}>
            <span className={labelTextCls}>Y Elevation (m)</span>
            <input
              type="number"
              step="0.1"
              value={elevation}
              onChange={(e) => setElevation(e.target.value)}
              className={inputCls}
            />
          </label>

          {/* Light-specific fields */}
          {isLight && (
            <>
              <label className={labelCls}>
                <span className={labelTextCls}>Fixture Type</span>
                <select
                  value={fixtureType}
                  onChange={(e) => {
                    setFixtureType(e.target.value);
                    // auto-fill channel hint
                    void getFixtureDef(e.target.value);
                  }}
                  className={inputCls}
                >
                  {getAllFixtureDefs().map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <label className={`${labelCls} flex-1`}>
                  <span className={labelTextCls}>Universe</span>
                  <input
                    type="number"
                    min={1}
                    value={universe}
                    onChange={(e) => setUniverse(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className={`${labelCls} flex-1`}>
                  <span className={labelTextCls}>Start ch.</span>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={startChannel}
                    onChange={(e) => setStartChannel(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </>
          )}

          {/* Stage platform */}
          {type === "stage_platform" && (
            <div className="flex gap-2">
              <label className={`${labelCls} flex-1`}>
                <span className={labelTextCls}>Width (m)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className={`${labelCls} flex-1`}>
                <span className={labelTextCls}>Depth (m)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className={`${labelCls} flex-1`}>
                <span className={labelTextCls}>Height (m)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={thickness}
                  onChange={(e) => setThickness(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {/* Truss beam */}
          {type === "truss_beam" && (
            <label className={labelCls}>
              <span className={labelTextCls}>Length (m)</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className={inputCls}
              />
            </label>
          )}

          {/* LED bar */}
          {type === "led_bar" && (
            <div className="flex gap-2">
              <label className={`${labelCls} flex-1`}>
                <span className={labelTextCls}>Length (m)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className={`${labelCls} flex-1`}>
                <span className={labelTextCls}>Segments</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={segments}
                  onChange={(e) => setSegments(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <Button type="submit" className="mt-0.5 text-sm py-1.5">
            Place on Stage
          </Button>
        </form>
      </div>
    </div>
  );
}
