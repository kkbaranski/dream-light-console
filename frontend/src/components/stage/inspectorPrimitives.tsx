import { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { useStageEditorStore } from "../../store/stageEditorStore";

// ─── Color Utilities ──────────────────────────────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PRESET_COLORS = [
  "#ffffff", "#fff5cc", "#cce5ff",
  "#ff0000", "#ff8800", "#ffff00",
  "#00ff00", "#00ffff", "#0000ff",
  "#ff00ff", "#ff0066", "#8800ff",
];

// ─── Lock Icon ────────────────────────────────────────────────────────────────

export function LockIcon({ locked }: { locked: boolean }) {
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

export function LockButton({
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

export function SectionDivider({ label }: { label: string }) {
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

export function PowerIcon() {
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

export function DraggableField({
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
    if (!dragged.current && Math.abs(dx) > 3) {
      dragged.current = true;
      useStageEditorStore.getState()._pauseHistory();
    }
    if (!dragged.current) return;
    onChange(clamp(startValue.current + dx * sensitivity));
  }

  function endDrag() {
    if (!dragged.current && startX.current !== null && !locked) {
      setEditing(true);
      setText(isMixed ? "" : value.toFixed(decimals));
      setTimeout(() => inputRef.current?.select(), 0);
    }
    if (dragged.current) {
      useStageEditorStore.getState()._resumeHistory();
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

export function ValueSlider({
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
        onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
        onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`w-full accent-blue-500 ${isMixed || locked ? "opacity-40" : ""} ${locked ? "cursor-not-allowed" : ""}`}
      />
    </div>
  );
}

// ─── Color Section ────────────────────────────────────────────────────────────

type ColorTab = "picker" | "rgb" | "presets";

export function ColorSection({
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
          <div
            className="[&_.react-colorful]:w-full [&_.react-colorful]:rounded-md [&_.react-colorful__saturation]:rounded-t-md [&_.react-colorful__hue]:rounded-b-md [&_.react-colorful__hue]:h-3 [&_.react-colorful__saturation]:h-32"
            onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
            onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
          >
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
                    onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
                    onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
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

export function PositionRow({
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
