import { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { useStageEditorStore } from "../../store/stageEditorStore";
import { LockClosedIcon, LockOpenIcon, GearIcon } from "../ui/Icons";

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
  return locked ? <LockClosedIcon /> : <LockOpenIcon />;
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

// ─── Gear Button ─────────────────────────────────────────────────────────────

export function GearButton({ open, onClick }: { open?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Configure"
      className={`flex-shrink-0 transition-colors p-0.5 rounded ${
        open ? "text-gray-300" : "text-gray-600 hover:text-gray-400"
      }`}
    >
      <GearIcon />
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

// ─── Category Section ────────────────────────────────────────────────────────

export function CategorySection({
  label,
  locked,
  onToggleLock,
  defaultOpen = true,
  children,
}: {
  label: string;
  locked: boolean;
  onToggleLock: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 first:mt-2">
      <div
        className="flex items-center gap-2 mb-1.5 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-blue-400/70">
          {label}
        </span>
        <div className="flex-1 h-px bg-blue-400/20" />
        <div onClick={(e) => e.stopPropagation()}>
          <LockButton locked={locked} onToggle={onToggleLock} />
        </div>
      </div>
      {open && (
        <div className={`pl-2 flex flex-col gap-3 ${locked ? "opacity-40 pointer-events-none" : ""}`}>
          {children}
        </div>
      )}
    </div>
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

// ─── Channel Input ───────────────────────────────────────────────────────────

export function ChannelInput({
  channel,
  onChange,
}: {
  channel: number;
  onChange?: (ch: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <span className="text-[10px] text-gray-600">Ch</span>
      <input
        type="number"
        min={1}
        max={512}
        value={channel}
        onChange={(e) => onChange?.(Math.max(1, Number(e.target.value) || 1))}
        readOnly={!onChange}
        className="w-7 bg-gray-800/60 text-[10px] font-mono text-gray-500 rounded px-0.5 py-0 border border-gray-700/50 outline-none focus:border-blue-500/50 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </span>
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
  channel,
  onChannelChange,
  headerExtra,
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
  channel?: number;
  onChannelChange?: (ch: number) => void;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center px-0.5">
        <div className="flex items-center gap-1.5">
          {channel != null && <ChannelInput channel={channel} onChange={onChannelChange} />}
          <span className="text-xs font-medium text-gray-400">{label}</span>
          {headerExtra}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-mono ${isMixed || locked ? "text-gray-600 italic" : "text-gray-400"}`}>
            {isMixed ? "—" : `${unit ? `${value}${unit}` : value} (${(value / max * 100).toFixed(1)}%)`}
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

// ─── 16-Bit Slider (Unfoldable Coarse/Fine) ─────────────────────────────────

export function Value16BitSlider({
  label,
  value,
  isMixed = false,
  locked = false,
  onToggleLock,
  onChange,
  coarseChannel,
  fineChannel,
  onCoarseChannelChange,
  onFineChannelChange,
  lockedCoarse = false,
  lockedFine = false,
  onToggleCoarseLock,
  onToggleFineLock,
  headerExtra,
}: {
  label: string;
  value: number;
  isMixed?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange: (value: number) => void;
  coarseChannel?: number;
  fineChannel?: number;
  onCoarseChannelChange?: (ch: number) => void;
  onFineChannelChange?: (ch: number) => void;
  lockedCoarse?: boolean;
  lockedFine?: boolean;
  onToggleCoarseLock?: () => void;
  onToggleFineLock?: () => void;
  headerExtra?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  const coarse = (value >> 8) & 0xff;
  const fine = value & 0xff;

  // Both coarse+fine locked behaves like master locked
  const effectivelyLocked = locked || (lockedCoarse && lockedFine);
  const coarseDisabled = effectivelyLocked || lockedCoarse;
  const fineDisabled = effectivelyLocked || lockedFine;

  function handleMasterChange(raw: number) {
    if (lockedCoarse) {
      // Keep coarse fixed, only fine part changes
      const newFine = Math.max(0, Math.min(255, raw - (coarse << 8)));
      onChange((coarse << 8) | newFine);
    } else if (lockedFine) {
      // Keep fine fixed, snap to nearest coarse step
      const newCoarse = Math.max(0, Math.min(255, Math.round((raw - fine) / 256)));
      onChange((newCoarse << 8) | fine);
    } else {
      onChange(raw);
    }
  }

  function handleCoarseChange(c: number) {
    onChange((c << 8) | fine);
  }

  function handleFineChange(f: number) {
    onChange((coarse << 8) | f);
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Combined slider header */}
      <div className="flex justify-between items-center px-0.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-600 hover:text-gray-400 transition-colors text-[10px] leading-none w-3"
          >
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
          <span className="text-xs font-medium text-gray-400">{label}</span>
          {headerExtra}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-mono ${isMixed || effectivelyLocked ? "text-gray-600 italic" : "text-gray-400"}`}>
            {isMixed ? "—" : `${value} (${(value / 65535 * 100).toFixed(1)}%)`}
          </span>
          {onToggleLock && <LockButton locked={locked} onToggle={onToggleLock} />}
        </div>
      </div>

      {/* Combined range 0-65535 */}
      <input
        type="range"
        min={0}
        max={65535}
        step={1}
        value={value}
        disabled={effectivelyLocked}
        onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
        onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
        onChange={(e) => handleMasterChange(Number(e.target.value))}
        className={`w-full accent-blue-500 ${isMixed || effectivelyLocked ? "opacity-40" : ""} ${effectivelyLocked ? "cursor-not-allowed" : ""}`}
      />

      {/* Coarse / Fine sub-sliders */}
      {expanded && (
        <div className="ml-1.5 pl-2.5 border-l border-gray-800 flex flex-col gap-1 mt-0.5 pb-1">
          {/* Coarse */}
          <div className="flex flex-col gap-0.5">
            <div className="flex justify-between items-center px-0.5">
              <div className="flex items-center gap-1.5">
                {coarseChannel != null && <ChannelInput channel={coarseChannel} onChange={onCoarseChannelChange} />}
                <span className="text-[11px] text-gray-500">Coarse</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[11px] font-mono ${coarseDisabled ? "text-gray-600" : "text-gray-400"}`}>
                  {isMixed ? "—" : `${coarse} (${(coarse / 255 * 100).toFixed(1)}%)`}
                </span>
                {onToggleCoarseLock && <LockButton locked={lockedCoarse} onToggle={onToggleCoarseLock} />}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={coarse}
              disabled={coarseDisabled}
              onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
              onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
              onChange={(e) => handleCoarseChange(Number(e.target.value))}
              className={`w-full accent-blue-500 ${coarseDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
            />
          </div>

          {/* Fine */}
          <div className="flex flex-col gap-0.5">
            <div className="flex justify-between items-center px-0.5">
              <div className="flex items-center gap-1.5">
                {fineChannel != null && <ChannelInput channel={fineChannel} onChange={onFineChannelChange} />}
                <span className="text-[11px] text-gray-500">Fine</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[11px] font-mono ${fineDisabled ? "text-gray-600" : "text-gray-400"}`}>
                  {isMixed ? "—" : `${fine} (${(fine / 255 * 100).toFixed(1)}%)`}
                </span>
                {onToggleFineLock && <LockButton locked={lockedFine} onToggle={onToggleFineLock} />}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={fine}
              disabled={fineDisabled}
              onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
              onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
              onChange={(e) => handleFineChange(Number(e.target.value))}
              className={`w-full accent-blue-500 ${fineDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
            />
          </div>
        </div>
      )}
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
