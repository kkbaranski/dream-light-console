import { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { useStageEditorStore, type PlacedLight } from "../../store/stageEditorStore";

// ─── Color Utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#ffffff", "#fff5cc", "#cce5ff",
  "#ff0000", "#ff8800", "#ffff00",
  "#00ff00", "#00ffff", "#0000ff",
  "#ff00ff", "#ff0066", "#8800ff",
];

// ─── Lock Icon ────────────────────────────────────────────────────────────────

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      viewBox="0 0 12 16"
      width="9"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="1" y="7" width="10" height="8" rx="1.5"
        fill={locked ? "currentColor" : "none"}
        stroke={locked ? "none" : "currentColor"}
        strokeWidth="1.4"
      />
      {locked
        ? <path d="M3 7V5a3 3 0 0 1 6 0v2" />
        : <path d="M3 7V5a3 3 0 0 1 6 0V3" />
      }
    </svg>
  );
}

function LockButton({
  locked,
  onToggle,
}: {
  locked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={locked ? "Unlock" : "Lock"}
      className={`flex-shrink-0 transition-colors p-0.5 rounded ${
        locked
          ? "text-amber-400 hover:text-amber-300"
          : "text-gray-700 hover:text-gray-400"
      }`}
    >
      <LockIcon locked={locked} />
    </button>
  );
}

// ─── Section Divider ──────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

// ─── Power Icon ───────────────────────────────────────────────────────────────

function PowerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2v7" />
      <path d="M18.4 6.6A9 9 0 1 1 5.6 6.6" />
    </svg>
  );
}

// ─── Draggable Number Field ───────────────────────────────────────────────────

function DraggableField({
  value,
  min = -Infinity,
  max = Infinity,
  sensitivity = 0.1,
  decimals = 2,
  unit = "",
  isMixed = false,
  locked = false,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  sensitivity?: number;
  decimals?: number;
  unit?: string;
  isMixed?: boolean;
  locked?: boolean;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const startX = useRef<number | null>(null);
  const startValue = useRef(0);
  const dragged = useRef(false);

  function clamp(n: number) {
    return parseFloat(Math.min(max, Math.max(min, n)).toFixed(decimals));
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (editing || locked) return;
    startX.current = event.clientX;
    startValue.current = value;
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    const dx = event.clientX - startX.current;
    if (!dragged.current && Math.abs(dx) > 3) dragged.current = true;
    if (!dragged.current) return;
    onChange(clamp(startValue.current + dx * sensitivity));
  }

  function endDrag() {
    if (!dragged.current && startX.current !== null && !locked) {
      setEditing(true);
      setText(isMixed ? "" : value.toFixed(decimals));
      setTimeout(() => inputRef.current?.select(), 0);
    }
    startX.current = null;
    dragged.current = false;
  }

  function commit() {
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) onChange(clamp(parsed));
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        className="w-full bg-gray-800 text-xs text-gray-100 rounded px-1 py-0.5 border border-blue-500 outline-none font-mono text-center"
      />
    );
  }

  return (
    <div
      onPointerDown={beginDrag}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      className={`text-xs rounded px-1 py-0.5 border font-mono text-center select-none ${
        locked
          ? "bg-gray-900 text-gray-600 border-gray-900 cursor-default"
          : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500 cursor-ew-resize"
      }`}
    >
      {isMixed && !dragged.current ? "—" : `${value.toFixed(decimals)}${unit}`}
    </div>
  );
}

// ─── Value Slider ─────────────────────────────────────────────────────────────

function ValueSlider({
  label,
  value,
  isMixed = false,
  min,
  max,
  step = 1,
  unit = "",
  locked = false,
  onToggleLock,
  onChange,
}: {
  label: string;
  value: number;
  isMixed?: boolean;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center px-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-mono ${isMixed || locked ? "text-gray-600 italic" : "text-gray-400"}`}>
            {isMixed ? "—" : unit ? `${value}${unit}` : value}
          </span>
          {onToggleLock && <LockButton locked={locked} onToggle={onToggleLock} />}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={locked}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`w-full accent-blue-500 ${isMixed || locked ? "opacity-40" : ""} ${locked ? "cursor-not-allowed" : ""}`}
      />
    </div>
  );
}

// ─── Color Section ────────────────────────────────────────────────────────────

type ColorTab = "picker" | "rgb" | "presets";

function ColorSection({
  color,
  isMixed,
  locked = false,
  onToggleLock,
  onChange,
}: {
  color: string;
  isMixed: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange: (hex: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ColorTab>("picker");
  const [hexText, setHexText] = useState(color);
  const hexFocused = useRef(false);

  useEffect(() => {
    if (!hexFocused.current) setHexText(color);
  }, [color]);

  const rgb = hexToRgb(color);

  function commitHex(raw: string) {
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      onChange(normalized.toLowerCase());
    } else {
      setHexText(color);
    }
    hexFocused.current = false;
  }

  const TABS: { id: ColorTab; label: string }[] = [
    { id: "picker", label: "Picker" },
    { id: "rgb", label: "RGB" },
    { id: "presets", label: "Presets" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Preview + editable hex + lock */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-6 rounded border border-gray-600 flex-shrink-0 overflow-hidden"
          style={
            isMixed
              ? { background: "linear-gradient(135deg,#f00 0%,#0f0 50%,#00f 100%)" }
              : { backgroundColor: color }
          }
        />
        <input
          type="text"
          value={isMixed ? "Multiple" : hexText}
          readOnly={isMixed || locked}
          onFocus={() => { hexFocused.current = true; }}
          onChange={(event) => setHexText(event.target.value)}
          onBlur={(event) => { if (!locked) commitHex(event.target.value); }}
          onKeyDown={(event) => {
            if (!locked && event.key === "Enter") commitHex(event.currentTarget.value);
          }}
          className={`flex-1 bg-gray-800 text-xs font-mono rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none ${
            isMixed || locked ? "text-gray-500 italic" : "text-gray-200"
          }`}
        />
        {onToggleLock && <LockButton locked={locked} onToggle={onToggleLock} />}
      </div>

      {/* Tab bar */}
      <div className={`flex ${locked ? "opacity-40 pointer-events-none" : ""}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 text-[10px] font-medium border-b transition-colors ${
              activeTab === tab.id
                ? "text-blue-400 border-blue-400"
                : "text-gray-500 border-gray-800 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={locked ? "opacity-40 pointer-events-none" : ""}>
        {activeTab === "picker" && (
          <div className="[&_.react-colorful]:w-full [&_.react-colorful]:rounded-md [&_.react-colorful__saturation]:rounded-t-md [&_.react-colorful__hue]:rounded-b-md [&_.react-colorful__hue]:h-3 [&_.react-colorful__saturation]:h-32">
            <HexColorPicker color={isMixed ? "#ffffff" : color} onChange={onChange} />
          </div>
        )}

        {activeTab === "rgb" && (
          <div className="flex flex-col gap-2">
            {(["r", "g", "b"] as const).map((ch) => {
              const accent = ch === "r" ? "#ef4444" : ch === "g" ? "#22c55e" : "#3b82f6";
              return (
                <div key={ch} className="flex flex-col gap-0.5">
                  <div className="flex justify-between px-0.5">
                    <span className="text-xs text-gray-500 uppercase">{ch}</span>
                    <span className="text-xs font-mono text-gray-400">{rgb[ch]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={rgb[ch]}
                    onChange={(event) => {
                      const updated = { ...rgb, [ch]: Number(event.target.value) };
                      onChange(rgbToHex(updated.r, updated.g, updated.b));
                    }}
                    className="w-full"
                    style={{ accentColor: accent }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "presets" && (
          <div className="grid grid-cols-6 gap-1.5">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                onClick={() => onChange(preset)}
                title={preset}
                className={`aspect-square rounded border transition-all ${
                  !isMixed && color.toLowerCase() === preset
                    ? "border-blue-400 ring-1 ring-blue-400"
                    : "border-gray-700 hover:border-gray-400"
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({
  label,
  value,
  min,
  max,
  sensitivity,
  decimals,
  unit,
  isMixed = false,
  locked = false,
  onToggleLock,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  sensitivity?: number;
  decimals?: number;
  unit?: string;
  isMixed?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-500 w-3 flex-shrink-0">{label}</span>
      <div className="flex-1">
        <DraggableField
          value={value}
          min={min}
          max={max}
          sensitivity={sensitivity}
          decimals={decimals}
          unit={unit}
          isMixed={isMixed}
          locked={locked}
          onChange={onChange}
        />
      </div>
      {onToggleLock && <LockButton locked={locked} onToggle={onToggleLock} />}
    </div>
  );
}

// ─── Main Inspector ───────────────────────────────────────────────────────────

export function LightInspector() {
  const placedLights = useStageEditorStore((state) => state.placedLights);
  const selectedLightIds = useStageEditorStore((state) => state.selectedLightIds);
  const updateSelectedLights = useStageEditorStore((state) => state.updateSelectedLights);
  const moveLights = useStageEditorStore((state) => state.moveLights);
  const toggleLock = useStageEditorStore((state) => state.toggleLock);

  const selectedLights = placedLights.filter((light) => selectedLightIds.includes(light.id));
  if (selectedLights.length === 0) return null;

  const count = selectedLights.length;

  function shared<T>(getter: (light: PlacedLight) => T): T | null {
    const values = selectedLights.map(getter);
    return values.every((v) => v === values[0]) ? values[0] : null;
  }

  function avgInt(getter: (light: PlacedLight) => number): number {
    return Math.round(selectedLights.reduce((sum, l) => sum + getter(l), 0) / count);
  }

  function avgFloat(getter: (light: PlacedLight) => number, decimals = 2): number {
    const sum = selectedLights.reduce((acc, l) => acc + getter(l), 0);
    return parseFloat((sum / count).toFixed(decimals));
  }

  // A field is "locked" for the selection if ANY selected light has it locked.
  function isLocked(field: string): boolean {
    return selectedLights.some((l) => l.lockedFields.includes(field));
  }

  // Toggle lock for a field across all selected lights.
  // Any locked → unlock all locked ones. None locked → lock all.
  function handleToggleLock(field: string) {
    const anyLocked = isLocked(field);
    for (const light of selectedLights) {
      const hasLock = light.lockedFields.includes(field);
      if (anyLocked && hasLock) toggleLock(light.id, field);
      else if (!anyLocked && !hasLock) toggleLock(light.id, field);
    }
  }

  function updatePositionAxis(axis: 0 | 1 | 2, value: number) {
    moveLights(
      selectedLights.map((light) => ({
        id: light.id,
        position: [
          axis === 0 ? value : light.position[0],
          axis === 1 ? value : light.position[1],
          axis === 2 ? value : light.position[2],
        ] as [number, number, number],
      })),
    );
  }

  const anyPowered = selectedLights.some((l) => l.powered);
  const sharedName = shared((l) => l.name);
  const sharedUniverse = shared((l) => l.universe);
  const sharedChannel = shared((l) => l.startChannel);
  const sharedDimmer = shared((l) => l.dimmer);
  const sharedColor = shared((l) => l.color);
  const sharedPan = shared((l) => l.pan);
  const sharedTilt = shared((l) => l.tilt);
  const sharedConeAngle = shared((l) => l.coneAngle);

  const sharedPosX = shared((l) => l.position[0]);
  const sharedPosY = shared((l) => l.position[1]);
  const sharedPosZ = shared((l) => l.position[2]);
  const sharedRotX = shared((l) => l.rotationX);
  const sharedRotY = shared((l) => l.rotationY);
  const sharedRotZ = shared((l) => l.rotationZ);

  const posX = sharedPosX ?? avgFloat((l) => l.position[0]);
  const posY = sharedPosY ?? avgFloat((l) => l.position[1]);
  const posZ = sharedPosZ ?? avgFloat((l) => l.position[2]);
  const rotX = sharedRotX ?? avgFloat((l) => l.rotationX, 1);
  const rotY = sharedRotY ?? avgFloat((l) => l.rotationY, 1);
  const rotZ = sharedRotZ ?? avgFloat((l) => l.rotationZ, 1);

  return (
    <div className="border-b border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {count === 1 ? "Selected Light" : `${count} Lights`}
        </span>
        <button
          onClick={() => updateSelectedLights({ powered: !anyPowered })}
          title={anyPowered ? "Turn off" : "Turn on"}
          className={`transition-colors ${
            anyPowered ? "text-yellow-400 hover:text-yellow-300" : "text-gray-600 hover:text-gray-400"
          }`}
        >
          <PowerIcon />
        </button>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-1">
        {/* Name — no lock */}
        <input
          type="text"
          value={sharedName ?? ""}
          placeholder={sharedName === null ? "Multiple values" : "Name"}
          onChange={(event) => updateSelectedLights({ name: event.target.value })}
          className="w-full bg-gray-800 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600"
        />

        {/* Brightness */}
        <SectionDivider label="Brightness" />
        <ValueSlider
          label="Dimmer"
          value={sharedDimmer ?? avgInt((l) => l.dimmer)}
          isMixed={sharedDimmer === null}
          min={0}
          max={255}
          locked={isLocked("dimmer")}
          onToggleLock={() => handleToggleLock("dimmer")}
          onChange={(value) => updateSelectedLights({ dimmer: value })}
        />

        {/* Color */}
        <SectionDivider label="Color" />
        <ColorSection
          color={sharedColor ?? selectedLights[0].color}
          isMixed={sharedColor === null}
          locked={isLocked("color")}
          onToggleLock={() => handleToggleLock("color")}
          onChange={(hex) => updateSelectedLights({ color: hex })}
        />

        {/* Head */}
        <SectionDivider label="Head" />
        <div className="flex flex-col gap-2">
          <ValueSlider
            label="Pan"
            value={sharedPan ?? avgInt((l) => l.pan)}
            isMixed={sharedPan === null}
            min={0}
            max={255}
            locked={isLocked("pan")}
            onToggleLock={() => handleToggleLock("pan")}
            onChange={(value) => updateSelectedLights({ pan: value })}
          />
          <ValueSlider
            label="Tilt"
            value={sharedTilt ?? avgInt((l) => l.tilt)}
            isMixed={sharedTilt === null}
            min={0}
            max={255}
            locked={isLocked("tilt")}
            onToggleLock={() => handleToggleLock("tilt")}
            onChange={(value) => updateSelectedLights({ tilt: value })}
          />
          <ValueSlider
            label="Beam angle"
            value={sharedConeAngle ?? avgInt((l) => l.coneAngle)}
            isMixed={sharedConeAngle === null}
            min={1}
            max={60}
            unit="°"
            locked={isLocked("coneAngle")}
            onToggleLock={() => handleToggleLock("coneAngle")}
            onChange={(value) => updateSelectedLights({ coneAngle: value })}
          />
        </div>

        {/* Position & Rotation */}
        <SectionDivider label="Position" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">
              World
            </span>
            <PositionRow
              label="X"
              value={posX}
              sensitivity={0.1}
              decimals={2}
              isMixed={sharedPosX === null}
              locked={isLocked("posX")}
              onToggleLock={() => handleToggleLock("posX")}
              onChange={(v) => updatePositionAxis(0, v)}
            />
            <PositionRow
              label="Y"
              value={posY}
              min={0}
              sensitivity={0.1}
              decimals={2}
              isMixed={sharedPosY === null}
              locked={isLocked("posY")}
              onToggleLock={() => handleToggleLock("posY")}
              onChange={(v) => updatePositionAxis(1, v)}
            />
            <PositionRow
              label="Z"
              value={posZ}
              sensitivity={0.1}
              decimals={2}
              isMixed={sharedPosZ === null}
              locked={isLocked("posZ")}
              onToggleLock={() => handleToggleLock("posZ")}
              onChange={(v) => updatePositionAxis(2, v)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">
              Rotation
            </span>
            <PositionRow
              label="X"
              value={rotX}
              min={-180}
              max={180}
              sensitivity={1}
              decimals={1}
              unit="°"
              isMixed={sharedRotX === null}
              locked={isLocked("rotationX")}
              onToggleLock={() => handleToggleLock("rotationX")}
              onChange={(v) => updateSelectedLights({ rotationX: v })}
            />
            <PositionRow
              label="Y"
              value={rotY}
              min={-180}
              max={180}
              sensitivity={1}
              decimals={1}
              unit="°"
              isMixed={sharedRotY === null}
              locked={isLocked("rotationY")}
              onToggleLock={() => handleToggleLock("rotationY")}
              onChange={(v) => updateSelectedLights({ rotationY: v })}
            />
            <PositionRow
              label="Z"
              value={rotZ}
              min={-180}
              max={180}
              sensitivity={1}
              decimals={1}
              unit="°"
              isMixed={sharedRotZ === null}
              locked={isLocked("rotationZ")}
              onToggleLock={() => handleToggleLock("rotationZ")}
              onChange={(v) => updateSelectedLights({ rotationZ: v })}
            />
          </div>
        </div>

        {/* DMX — last */}
        <SectionDivider label="DMX" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">Universe</span>
            <input
              type="number"
              min={1}
              max={16}
              value={sharedUniverse ?? ""}
              placeholder={sharedUniverse === null ? "—" : ""}
              disabled={isLocked("universe")}
              onChange={(event) =>
                updateSelectedLights({ universe: Math.max(1, Number(event.target.value)) })
              }
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${
                isLocked("universe") ? "opacity-40 cursor-not-allowed" : ""
              }`}
            />
            <LockButton locked={isLocked("universe")} onToggle={() => handleToggleLock("universe")} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">Channel</span>
            <input
              type="number"
              min={1}
              max={512}
              value={sharedChannel ?? ""}
              placeholder={sharedChannel === null ? "—" : ""}
              disabled={isLocked("startChannel")}
              onChange={(event) =>
                updateSelectedLights({ startChannel: Math.max(1, Number(event.target.value)) })
              }
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${
                isLocked("startChannel") ? "opacity-40 cursor-not-allowed" : ""
              }`}
            />
            <LockButton locked={isLocked("startChannel")} onToggle={() => handleToggleLock("startChannel")} />
          </div>
        </div>
      </div>
    </div>
  );
}
