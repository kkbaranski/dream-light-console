import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { FixtureAvatar } from "../components/ui/FixtureAvatar";
import { FixturePreview3D } from "../components/stage/FixturePreview3D";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ModelPreview } from "../components/stage/ModelPreview";
import {
  useFixture,
  useUpdateFixture,
  useUploadAvatar,
  useDeleteAvatar,
  useDeleteFixture,
} from "../api/hooks";
import {
  DEVICE_REGISTRY,
  activeFeatures,
} from "../devices/registry";
import { FEATURE_CATEGORIES } from "../devices/feature";
import { CategorySection } from "../components/stage/inspectorPrimitives";
import type { SceneObjectType, DeviceDef } from "../devices/registry";
import type {
  FeatureObject,
  InspectorCtx,
  BoundFeature,
  DmxChannelDef,
} from "../devices/feature";
import type { ColorWheelConfig } from "../devices/features/color/colorWheel";
import type { GoboWheelConfig } from "../devices/features/gobo/goboWheel";
import type { PanConfig } from "../devices/features/panTilt/pan";
import type { TiltConfig } from "../devices/features/panTilt/tilt";
import type { CurvePoint } from "../lib/cubicSpline";
import { CurveEditor } from "../components/ui/CurveEditor";
import { hexToRgb } from "../components/stage/inspectorPrimitives";
import { useDMXStore } from "../store/dmxStore";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditableWheelSlot {
  name: string;
  dmxStart: number;
  dmxEnd: number;
  hex?: string;
  hasIntensity?: boolean;
  texturePath?: string;
}

/** Shape of the persisted config_json blob. */
interface FixtureConfig {
  channelMap?: Record<string, number>;
  colorWheelSlots?: EditableWheelSlot[];
  goboWheelSlots?: EditableWheelSlot[];
  panCurve?: CurvePoint[];
  tiltCurve?: CurvePoint[];
  lockedFields?: string[];
  dmxUniverse?: number;
  dmxAddress?: number;
  dmxActive?: boolean;
}

function parseFixtureConfig(raw: string): FixtureConfig {
  try { return JSON.parse(raw) as FixtureConfig; } catch { return {}; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFeatureObject(
  fixtureId: string,
  fixtureTypeId: string,
  modeKey: string,
  featureState: Record<string, unknown>,
): FeatureObject {
  return {
    id: fixtureId,
    type: fixtureTypeId,
    position: [0, 0, 0],
    lockedFields: [],
    mode: modeKey,
    ...featureState,
  } as FeatureObject;
}

function buildDefaultFeatureState(
  features: ReadonlyArray<BoundFeature>,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const { feature, config } of features) {
    Object.assign(state, feature.defaultState(config));
  }
  return state;
}

/**
 * Build the default channel map from features.
 * Keys: "field" for 8-bit, "field:coarse" / "field:fine" for 16-bit.
 * Values: 0-based offsets.
 */
function buildDefaultChannelMap(
  features: ReadonlyArray<BoundFeature>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const { feature, config } of features) {
    if (!feature.dmxChannels) continue;
    const channels = feature.dmxChannels(config);
    for (const ch of channels) {
      if (ch.encoding.kind === "linear16") {
        map[`${ch.field}:coarse`] = ch.offset;
        // Extract fine offset from config; fallback to coarse + 1
        const dmxCfg = (config as Record<string, unknown>).dmx as Record<string, unknown> | undefined;
        const fineOffset = dmxCfg && "fine" in dmxCfg ? dmxCfg.fine as number : ch.offset + 1;
        map[`${ch.field}:fine`] = fineOffset;
      } else {
        map[ch.field] = ch.offset;
      }
    }
  }
  return map;
}

function buildInspectorCtx(
  featureObject: FeatureObject,
  onUpdate: (patch: Record<string, unknown>) => void,
  channels: Record<string, number>,
  onChannelChange: (key: string, ch: number) => void,
  lockedFields: ReadonlySet<string>,
  onToggleLock: (field: string) => void,
  configOpen: Record<string, boolean>,
  onToggleConfig: (featureType: string) => void,
): InspectorCtx {
  return {
    selected: [featureObject],
    shared: (getter) => getter(featureObject),
    isMixed: () => false,
    avgInt: (getter) => Math.round(getter(featureObject)),
    avgFloat: (getter, decimals = 2) =>
      parseFloat(getter(featureObject).toFixed(decimals)),
    isLocked: (field) => lockedFields.has(field),
    update: onUpdate,
    move: () => {},
    toggleLock: onToggleLock,
    channels,
    onChannelChange,
    configOpen,
    onToggleConfig,
  };
}

function encodeDmxValues(
  patch: Record<string, unknown>,
  features: ReadonlyArray<BoundFeature>,
  startChannel: number,
  channelMap: Record<string, number>,
): Array<{ channel: number; value: number }> {
  const results: Array<{ channel: number; value: number }> = [];

  for (const { feature, config } of features) {
    if (!feature.dmxChannels) continue;
    const channels: ReadonlyArray<DmxChannelDef> = feature.dmxChannels(config);
    for (const ch of channels) {
      if (!(ch.field in patch)) continue;
      const raw = patch[ch.field];

      switch (ch.encoding.kind) {
        case "linear8": {
          const offset = channelMap[ch.field] ?? ch.offset;
          results.push({ channel: startChannel + offset, value: Math.round(raw as number) & 0xff });
          break;
        }
        case "linear16": {
          const val = Math.round(raw as number) & 0xffff;
          const coarseOffset = channelMap[`${ch.field}:coarse`] ?? ch.offset;
          const fineOffset = channelMap[`${ch.field}:fine`] ?? ch.offset + 1;
          results.push({ channel: startChannel + coarseOffset, value: (val >> 8) & 0xff });
          results.push({ channel: startChannel + fineOffset, value: val & 0xff });
          break;
        }
        case "rgbHex": {
          const offset = channelMap[ch.field] ?? ch.offset;
          const rgb = hexToRgb(raw as string);
          results.push({ channel: startChannel + offset, value: rgb.r });
          results.push({ channel: startChannel + offset + 1, value: rgb.g });
          results.push({ channel: startChannel + offset + 2, value: rgb.b });
          break;
        }
        case "step": {
          const offset = channelMap[ch.field] ?? ch.offset;
          results.push({
            channel: startChannel + offset,
            value: ch.encoding.steps[raw as number]?.dmxValue ?? 0,
          });
          break;
        }
      }
    }
  }

  return results;
}

// ─── Available gobo textures ─────────────────────────────────────────────────

const AVAILABLE_GOBO_TEXTURES = [
  { path: "/textures/gobos/gobo1.png", label: "Gobo 1" },
  { path: "/textures/gobos/gobo2.png", label: "Gobo 2" },
  { path: "/textures/gobos/gobo3.png", label: "Gobo 3" },
  { path: "/textures/gobos/gobo4.png", label: "Gobo 4" },
  { path: "/textures/gobos/gobo5.png", label: "Gobo 5" },
  { path: "/textures/gobos/gobo7.png", label: "Gobo 7" },
  { path: "/textures/gobos/auto_mode.png", label: "Auto Mode" },
];

// ─── Gobo Texture Picker ─────────────────────────────────────────────────────

function NoGoboPlaceholder() {
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full text-gray-600" fill="none" stroke="currentColor" strokeWidth={1}>
      <line x1="0" y1="0" x2="24" y2="24" />
      <line x1="24" y1="0" x2="0" y2="24" />
    </svg>
  );
}

function GoboTexturePicker({ value, onChange }: { value?: string; onChange: (path?: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-6 h-6 rounded border bg-gray-800 flex items-center justify-center overflow-hidden cursor-pointer ${
          open ? "border-blue-500" : "border-gray-700 hover:border-gray-500"
        }`}
      >
        {value ? (
          <img src={value} alt="gobo" className="w-full h-full object-contain" />
        ) : (
          <NoGoboPlaceholder />
        )}
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-1.5">
          <div className="flex gap-1">
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className={`w-8 h-8 rounded border transition-colors flex items-center justify-center bg-gray-700 flex-shrink-0 ${
                !value ? "border-blue-500" : "border-transparent hover:border-gray-500"
              }`}
            >
              <NoGoboPlaceholder />
            </button>
            {AVAILABLE_GOBO_TEXTURES.map((gobo) => (
              <button
                key={gobo.path}
                title={gobo.label}
                onClick={() => { onChange(gobo.path); setOpen(false); }}
                className={`w-8 h-8 rounded border transition-colors flex items-center justify-center overflow-hidden bg-gray-700 flex-shrink-0 ${
                  value === gobo.path ? "border-blue-500" : "border-transparent hover:border-gray-500"
                }`}
              >
                <img src={gobo.path} alt={gobo.label} className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wheel Slot Editor ───────────────────────────────────────────────────────

function WheelSlotEditor({
  slots,
  onChange,
  showColor,
  showIntensity,
  showGobo,
}: {
  slots: EditableWheelSlot[];
  onChange: (slots: EditableWheelSlot[]) => void;
  showColor: boolean;
  showIntensity?: boolean;
  showGobo?: boolean;
}) {
  function updateSlot(index: number, patch: Partial<EditableWheelSlot>) {
    onChange(slots.map((s, i) => i === index ? { ...s, ...patch } : s));
  }
  function removeSlot(index: number) {
    onChange(slots.filter((_, i) => i !== index));
  }
  function addSlot() {
    const lastEnd = slots.length > 0 ? slots[slots.length - 1].dmxEnd : -1;
    const newStart = Math.min(255, lastEnd + 1);
    const newEnd = Math.min(255, newStart + 31);
    onChange([...slots, {
      name: `Slot ${slots.length + 1}`,
      dmxStart: newStart,
      dmxEnd: newEnd,
      ...(showColor ? { hex: "#ffffff" } : {}),
    }]);
  }

  return (
    <div className="ml-1 mt-1.5 flex flex-col gap-1.5">
      {slots.map((slot, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={slot.name}
            onChange={(e) => updateSlot(i, { name: e.target.value })}
            className="w-36 bg-gray-800 text-xs text-white rounded px-1.5 py-1 border border-gray-700 outline-none focus:border-blue-500"
          />
          {showColor && (
            <input
              type="color"
              value={slot.hex ?? "#ffffff"}
              onChange={(e) => updateSlot(i, { hex: e.target.value })}
              className="w-6 h-6 rounded border border-gray-700 bg-transparent cursor-pointer p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0"
            />
          )}
          {showGobo && (
            <GoboTexturePicker
              value={slot.texturePath}
              onChange={(path) => updateSlot(i, { texturePath: path })}
            />
          )}
          <span className="inline-flex items-center gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-gray-600">Ch</span>
            <input
              type="number"
              min={0}
              max={255}
              value={slot.dmxStart}
              onChange={(e) => updateSlot(i, { dmxStart: Number(e.target.value) || 0 })}
              className="w-7 bg-gray-800/60 text-[10px] font-mono text-gray-500 rounded px-0.5 py-0 border border-gray-700/50 outline-none focus:border-blue-500/50 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-gray-600 text-[10px]">–</span>
            <input
              type="number"
              min={0}
              max={255}
              value={slot.dmxEnd}
              onChange={(e) => updateSlot(i, { dmxEnd: Number(e.target.value) || 0 })}
              className="w-7 bg-gray-800/60 text-[10px] font-mono text-gray-500 rounded px-0.5 py-0 border border-gray-700/50 outline-none focus:border-blue-500/50 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </span>
          {showIntensity && (
            <label className="flex items-center gap-1 cursor-pointer" title="Enable intensity slider for this range">
              <button
                type="button"
                role="switch"
                aria-checked={slot.hasIntensity ?? false}
                onClick={() => updateSlot(i, { hasIntensity: !(slot.hasIntensity ?? false) })}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border border-gray-600 transition-colors ${slot.hasIntensity ? "bg-blue-500 border-blue-500" : "bg-gray-700"}`}
              >
                <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${slot.hasIntensity ? "translate-x-3" : "translate-x-0"}`} />
              </button>
              <span className="text-[11px] text-gray-400">Intensity</span>
            </label>
          )}
          <button
            onClick={() => removeSlot(i)}
            className="text-gray-600 hover:text-red-400 text-sm font-bold transition-colors px-0.5"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addSlot}
        className="self-start text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        + Add Slot
      </button>
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-gray-400 text-xs">{label}</label>
      {children}
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export function FixturePage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();

  const { data: fixture, isLoading } = useFixture(fixtureId!);
  const updateFixture = useUpdateFixture(fixtureId!);
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const deleteFixture = useDeleteFixture();

  const fixtureTypeId = fixture?.fixture_type_id ?? null;
  const def = fixtureTypeId ? DEVICE_REGISTRY[fixtureTypeId as SceneObjectType] as DeviceDef | undefined : undefined;

  // Persisted form state
  const [label, setLabel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [modeKey, setModeKey] = useState("");
  const [defaultUniverse, setDefaultUniverse] = useState(1);
  const [defaultAddress, setDefaultAddress] = useState(0);

  // Ephemeral state
  const [featureState, setFeatureState] = useState<Record<string, unknown>>({});
  const [universe, setUniverse] = useState(1);
  const [startChannel, setStartChannel] = useState(0);
  const [dmxActive, setDmxActive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Channel map: key → 0-based offset (editable per-channel assignments)
  const [channelMap, setChannelMap] = useState<Record<string, number>>({});

  // Editable wheel slots
  const [colorWheelSlots, setColorWheelSlots] = useState<EditableWheelSlot[]>([]);
  const [goboWheelSlots, setGoboWheelSlots] = useState<EditableWheelSlot[]>([]);

  // Response curves for pan/tilt
  const [panCurve, setPanCurve] = useState<CurvePoint[] | null>(null);
  const [tiltCurve, setTiltCurve] = useState<CurvePoint[] | null>(null);

  // Locked fields
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

  // Per-feature config panel open state
  const [configOpen, setConfigOpen] = useState<Record<string, boolean>>({});

  // Saved DMX values before curve drag (to restore after drag ends)
  const preDragPan = useRef<number | null>(null);
  const preDragTilt = useRef<number | null>(null);

  // Stable DMX values for curve chart display (don't move during drag)
  const [panDmxDisplay, setPanDmxDisplay] = useState<number | undefined>(undefined);
  const [tiltDmxDisplay, setTiltDmxDisplay] = useState<number | undefined>(undefined);

  // Tracks whether form has unsaved changes
  const [dirty, setDirty] = useState(false);

  // Guard: skip auto-save until initial config is loaded
  const configLoaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Track previous features ref to only reset featureState on mode/device change
  const prevFeaturesRef = useRef<ReadonlyArray<BoundFeature>>([]);

  // Initialize form state from fixture data
  useEffect(() => {
    if (!fixture || !def) return;
    configLoaded.current = false;
    setLabel(fixture.label);
    setSerialNumber(fixture.serial_number);
    setNotes(fixture.notes);
    setModeKey(fixture.dmx_mode || def.defaultMode);
    setDefaultUniverse(fixture.default_universe);
    setDefaultAddress(fixture.default_address);
    // DMX output: load saved config, fallback to fixture defaults
    const saved = parseFixtureConfig(fixture.config_json);
    setUniverse(saved.dmxUniverse ?? fixture.default_universe);
    setStartChannel(saved.dmxAddress ?? fixture.default_address);
    setDmxActive(saved.dmxActive ?? false);
    setLockedFields(new Set(saved.lockedFields ?? []));
    setDirty(false);
  }, [fixture, def]);

  // Initialize feature state, channel map, and wheel slots from mode defaults + saved config
  const features = useMemo(
    () => (def && modeKey ? activeFeatures(def, modeKey) : []),
    [def, modeKey],
  );

  useEffect(() => {
    if (features.length === 0) return;

    // Only reset DMX slider values when features change (mode/device switch),
    // not on every fixture refetch triggered by auto-save.
    if (prevFeaturesRef.current !== features) {
      setFeatureState(buildDefaultFeatureState(features));
      prevFeaturesRef.current = features;
    }

    const saved = fixture ? parseFixtureConfig(fixture.config_json) : {};

    // Channel map: saved overrides defaults
    const defaults = buildDefaultChannelMap(features);
    setChannelMap(saved.channelMap ? { ...defaults, ...saved.channelMap } : defaults);

    // Color wheel slots: saved overrides defaults
    const cwFeature = features.find(b => b.feature.type === "colorWheel");
    if (cwFeature && saved.colorWheelSlots && saved.colorWheelSlots.length > 0) {
      setColorWheelSlots(saved.colorWheelSlots);
    } else if (cwFeature) {
      const cfg = cwFeature.config as ColorWheelConfig;
      setColorWheelSlots(cfg.colors.map(c => ({
        name: c.name, hex: c.hex,
        dmxStart: c.dmxStart, dmxEnd: c.dmxEnd,
      })));
    } else {
      setColorWheelSlots([]);
    }

    // Gobo wheel slots: saved overrides defaults
    const gwFeature = features.find(b => b.feature.type === "goboWheel");
    if (gwFeature && saved.goboWheelSlots && saved.goboWheelSlots.length > 0) {
      setGoboWheelSlots(saved.goboWheelSlots);
    } else if (gwFeature) {
      const cfg = gwFeature.config as GoboWheelConfig;
      setGoboWheelSlots(cfg.gobos.map(g => ({
        name: g.name,
        dmxStart: g.dmxStart, dmxEnd: g.dmxEnd,
        hasIntensity: g.hasIntensity,
        texturePath: g.texturePath,
      })));
    } else {
      setGoboWheelSlots([]);
    }

    // Response curves: load from saved config
    const panFeature = features.find(b => b.feature.type === "pan");
    if (panFeature && saved.panCurve && saved.panCurve.length >= 2) {
      setPanCurve(saved.panCurve);
    } else if (panFeature) {
      const cfg = panFeature.config as PanConfig;
      const panXMax = cfg.dmx && "coarse" in cfg.dmx ? 65535 : 255;
      setPanCurve([{ x: 0, y: 0 }, { x: panXMax, y: cfg.totalDegrees }]);
    } else {
      setPanCurve(null);
    }

    const tiltFeature = features.find(b => b.feature.type === "tilt");
    if (tiltFeature && saved.tiltCurve && saved.tiltCurve.length >= 2) {
      setTiltCurve(saved.tiltCurve);
    } else if (tiltFeature) {
      const cfg = tiltFeature.config as TiltConfig;
      const tiltXMax = cfg.dmx && "coarse" in cfg.dmx ? 65535 : 255;
      setTiltCurve([{ x: 0, y: 0 }, { x: tiltXMax, y: cfg.totalDegrees }]);
    } else {
      setTiltCurve(null);
    }

    // Allow auto-save after a tick (so the initial sets don't trigger it)
    const t = setTimeout(() => { configLoaded.current = true; }, 0);
    return () => clearTimeout(t);
  }, [features, fixture]);

  // Auto-save config_json when channel map or wheel slots change (debounced 500ms)
  useEffect(() => {
    if (!configLoaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const config: FixtureConfig = {
        channelMap,
        colorWheelSlots: colorWheelSlots.length > 0 ? colorWheelSlots : undefined,
        goboWheelSlots: goboWheelSlots.length > 0 ? goboWheelSlots : undefined,
        panCurve: panCurve ?? undefined,
        tiltCurve: tiltCurve ?? undefined,
        lockedFields: lockedFields.size > 0 ? [...lockedFields] : undefined,
        dmxUniverse: universe,
        dmxAddress: startChannel,
        dmxActive,
      };
      updateFixture.mutate({ config_json: JSON.stringify(config) });
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [channelMap, colorWheelSlots, goboWheelSlots, panCurve, tiltCurve, lockedFields, universe, startChannel, dmxActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build effective features with overridden wheel configs and response curves
  const effectiveFeatures = useMemo(() => {
    return features.map(({ feature, config }) => {
      if (feature.type === "colorWheel" && colorWheelSlots.length > 0) {
        const orig = config as ColorWheelConfig;
        return {
          feature,
          config: {
            dmx: orig.dmx,
            defaultIndex: 0,
            colors: colorWheelSlots.map(s => ({
              name: s.name,
              hex: s.hex ?? "#ffffff",
              dmxStart: s.dmxStart,
              dmxEnd: s.dmxEnd,
            })),
          },
        };
      }
      if (feature.type === "goboWheel" && goboWheelSlots.length > 0) {
        const orig = config as GoboWheelConfig;
        return {
          feature,
          config: {
            dmx: orig.dmx,
            defaultIndex: 0,
            gobos: goboWheelSlots.map(s => ({
              name: s.name,
              dmxStart: s.dmxStart,
              dmxEnd: s.dmxEnd,
              hasIntensity: s.hasIntensity,
              texturePath: s.texturePath,
            })),
          },
        };
      }
      if (feature.type === "pan" && panCurve && panCurve.length >= 2) {
        return { feature, config: { ...config as PanConfig, responseCurve: panCurve } };
      }
      if (feature.type === "tilt" && tiltCurve && tiltCurve.length >= 2) {
        return { feature, config: { ...config as TiltConfig, responseCurve: tiltCurve } };
      }
      return { feature, config };
    });
  }, [features, colorWheelSlots, goboWheelSlots, panCurve, tiltCurve]);

  // Build the virtual FeatureObject for the 3D preview (ref for imperative reads)
  const featureObject = useMemo(
    () => buildFeatureObject(fixtureId!, fixtureTypeId ?? "", modeKey, featureState),
    [fixtureId, fixtureTypeId, modeKey, featureState],
  );
  const featureObjectRef = useRef<FeatureObject>(featureObject);
  featureObjectRef.current = featureObject;

  // 1-based channel map for InspectorCtx
  const channels1Based = useMemo(
    () => Object.fromEntries(Object.entries(channelMap).map(([k, v]) => [k, v + 1])),
    [channelMap],
  );

  const handleChannelChange = useCallback(
    (key: string, ch1: number) => setChannelMap(prev => ({ ...prev, [key]: ch1 - 1 })),
    [],
  );

  // DMX send helper
  const sendDmxPatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (!dmxActive) return;
      const encoded = encodeDmxValues(patch, effectiveFeatures, startChannel, channelMap);
      const send = useDMXStore.getState().sendControl;
      for (const { channel, value } of encoded) {
        send({ type: "set_channel", universe, channel, value });
      }
    },
    [dmxActive, effectiveFeatures, startChannel, universe, channelMap],
  );

  // Inspector update callback (respects locked fields)
  const handleFeatureUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      const filtered = Object.fromEntries(
        Object.entries(patch).filter(([key]) => !lockedFields.has(key)),
      );
      if (Object.keys(filtered).length === 0) return;
      setFeatureState((prev) => ({ ...prev, ...filtered }));
      sendDmxPatch(filtered);
    },
    [sendDmxPatch, lockedFields],
  );

  const handleToggleLock = useCallback(
    (field: string) => {
      setLockedFields(prev => {
        const next = new Set(prev);
        if (next.has(field)) next.delete(field);
        else next.add(field);
        return next;
      });
    },
    [],
  );

  const handleToggleConfig = useCallback(
    (featureType: string) => setConfigOpen(prev => ({ ...prev, [featureType]: !prev[featureType] })),
    [],
  );

  const ctx = useMemo(
    () => buildInspectorCtx(featureObject, handleFeatureUpdate, channels1Based, handleChannelChange, lockedFields, handleToggleLock, configOpen, handleToggleConfig),
    [featureObject, handleFeatureUpdate, channels1Based, handleChannelChange, lockedFields, handleToggleLock, configOpen, handleToggleConfig],
  );

  // Curve drag preview: temporarily set pan/tilt DMX value to dragged point's X
  const handlePanDragPreview = useCallback((x: number | null) => {
    if (x !== null) {
      setFeatureState((prev) => {
        if (preDragPan.current === null) {
          preDragPan.current = (prev.pan as number) ?? 0;
          setPanDmxDisplay(preDragPan.current);
        }
        return { ...prev, pan: x };
      });
    } else if (preDragPan.current !== null) {
      const restore = preDragPan.current;
      preDragPan.current = null;
      setPanDmxDisplay(undefined);
      setFeatureState((prev) => ({ ...prev, pan: restore }));
    }
  }, []);

  const handleTiltDragPreview = useCallback((x: number | null) => {
    if (x !== null) {
      setFeatureState((prev) => {
        if (preDragTilt.current === null) {
          preDragTilt.current = (prev.tilt as number) ?? 0;
          setTiltDmxDisplay(preDragTilt.current);
        }
        return { ...prev, tilt: x };
      });
    } else if (preDragTilt.current !== null) {
      const restore = preDragTilt.current;
      preDragTilt.current = null;
      setTiltDmxDisplay(undefined);
      setFeatureState((prev) => ({ ...prev, tilt: restore }));
    }
  }, []);

  // DMX-relevant features: all features that belong to any category
  const dmxFeatures = useMemo(
    () => effectiveFeatures.filter((b) =>
      FEATURE_CATEGORIES.some((c) => c.features.includes(b.feature.type)),
    ),
    [effectiveFeatures],
  );

  function handleSave() {
    updateFixture.mutate(
      {
        label: label.trim(),
        serial_number: serialNumber.trim(),
        notes: notes.trim(),
        dmx_mode: modeKey,
        default_universe: defaultUniverse,
        default_address: defaultAddress,
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  function handleAvatarUpload(dataUrl: string) {
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => uploadAvatar.mutate({ fixtureId: fixtureId!, blob }));
  }

  function handleAvatarRemove() {
    deleteAvatar.mutate(fixtureId!);
  }

  function handleDelete() {
    deleteFixture.mutate(fixtureId!, {
      onSuccess: () => navigate("/fixtures"),
    });
  }

  function handleModeChange(newMode: string) {
    setModeKey(newMode);
    setDirty(true);
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 h-full">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading fixture...</p>
        </main>
      </div>
    );
  }

  if (!fixture || !def) {
    return (
      <div className="flex flex-1 h-full">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Fixture not found</p>
        </main>
      </div>
    );
  }

  const typeLabel = def.label;
  const modeEntries = Object.entries(def.modes);
  const avatarUrl = fixture.avatar_path
    ? `/data/avatars/${fixture.avatar_path}`
    : null;

  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="max-w-5xl mx-auto px-8 pt-6 pb-2 flex items-center justify-between">
          <button
            onClick={() => navigate("/fixtures")}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            &larr; Back to Fixtures
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 text-xs font-medium rounded border border-red-900/60 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
          >
            Delete Fixture
          </button>
        </div>

        {/* Info section */}
        <div className="max-w-5xl mx-auto px-8 py-4">
          <h2 className="text-sm font-semibold text-white tracking-wide mb-4">Fixture Info</h2>
          <div className="flex gap-5 mb-5">
            <div className="flex-1 flex flex-col gap-3">
              <Field label="Name">
                <input
                  value={label}
                  onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
                  placeholder="Name"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                />
              </Field>
              <Field label="Fixture Type">
                <input
                  value={typeLabel}
                  disabled
                  className="bg-gray-800/50 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-400 text-sm cursor-not-allowed"
                />
              </Field>
              <Field label="Serial Number">
                <input
                  value={serialNumber}
                  onChange={(e) => { setSerialNumber(e.target.value); setDirty(true); }}
                  placeholder="Optional"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                />
              </Field>
            </div>

            <FixtureAvatar
              photo={avatarUrl}
              fallback={<ModelPreview path={def.modelPath} />}
              onPhotoChange={handleAvatarUpload}
              onPhotoRemove={avatarUrl ? handleAvatarRemove : undefined}
            />
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              placeholder="Optional"
              rows={2}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
          </Field>

          <div className="flex items-end gap-4 mt-4">
            {modeEntries.length > 1 && (
              <Field label="Mode">
                <select
                  value={modeKey}
                  onChange={(e) => handleModeChange(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                >
                  {modeEntries.map(([key, mode]) => (
                    <option key={key} value={key}>{mode.label}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Default Universe">
              <input
                type="number"
                min={1}
                max={32768}
                value={defaultUniverse}
                onChange={(e) => { setDefaultUniverse(Number(e.target.value) || 1); setDirty(true); }}
                className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
              />
            </Field>
            <Field label="Default Address">
              <input
                type="number"
                min={1}
                max={512}
                value={defaultAddress + 1}
                onChange={(e) => { setDefaultAddress(Math.max(0, (Number(e.target.value) || 1) - 1)); setDirty(true); }}
                className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
              />
            </Field>
            {dirty && (
              <button
                onClick={handleSave}
                disabled={updateFixture.isPending}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {updateFixture.isPending ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </div>

        {/* DMX Controls + 3D Preview */}
        {dmxFeatures.length > 0 && (
          <div className="max-w-5xl mx-auto px-8 pb-8">
            <hr className="border-gray-700/60 mb-6" />
            <h2 className="text-sm font-semibold text-white tracking-wide mb-4">DMX Controls</h2>
            <div className="grid grid-cols-2 gap-6">
              {/* Left column: DMX Controls */}
              <div className="flex flex-col gap-4">

                {/* Feature inspectors grouped by category */}
                <div className="flex flex-col gap-1">
                  {FEATURE_CATEGORIES.map((cat) => {
                    const catFeatures = dmxFeatures.filter((b) => {
                      if (!cat.features.includes(b.feature.type)) return false;
                      if (b.feature.type === "beam" && !(b.config as { coneAngle?: unknown }).coneAngle) return false;
                      return true;
                    });
                    if (catFeatures.length === 0) return null;
                    const catLockKey = `cat:${cat.key}`;
                    return (
                      <CategorySection
                        key={cat.key}
                        label={cat.label}
                        locked={lockedFields.has(catLockKey)}
                        onToggleLock={() => handleToggleLock(catLockKey)}
                      >
                        {catFeatures.map(({ feature, config }) => {
                          const Inspector = feature.Inspector;
                          if (!Inspector) return null;
                          return (
                            <div key={feature.type}>
                              <Inspector ctx={ctx} config={config} />
                              {feature.type === "colorWheel" && configOpen.colorWheel && (
                                <div className="ml-1.5 pl-2.5 border-l border-gray-800 mt-3">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Configure Slots</span>
                                  <WheelSlotEditor slots={colorWheelSlots} onChange={setColorWheelSlots} showColor />
                                </div>
                              )}
                              {feature.type === "goboWheel" && configOpen.goboWheel && (
                                <div className="ml-1.5 pl-2.5 border-l border-gray-800 mt-3">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Configure Slots</span>
                                  <WheelSlotEditor slots={goboWheelSlots} onChange={setGoboWheelSlots} showColor={false} showIntensity showGobo />
                                </div>
                              )}
                              {feature.type === "pan" && panCurve && configOpen.pan && (() => {
                                const cfg = config as PanConfig;
                                const is16bit = !!(cfg.dmx && "coarse" in cfg.dmx);
                                return (
                                  <div className="ml-1.5 pl-2.5 border-l border-gray-800 mt-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1 block">Response Curve</span>
                                    <CurveEditor
                                      points={panCurve}
                                      xMax={is16bit ? 65535 : 255}
                                      yMax={cfg.totalDegrees}
                                      dmxValue={panDmxDisplay ?? featureState.pan as number | undefined}
                                      onChange={setPanCurve}
                                      onDragPreview={handlePanDragPreview}
                                    />
                                  </div>
                                );
                              })()}
                              {feature.type === "tilt" && tiltCurve && configOpen.tilt && (() => {
                                const cfg = config as TiltConfig;
                                const is16bit = !!(cfg.dmx && "coarse" in cfg.dmx);
                                return (
                                  <div className="ml-1.5 pl-2.5 border-l border-gray-800 mt-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1 block">Response Curve</span>
                                    <CurveEditor
                                      points={tiltCurve}
                                      xMax={is16bit ? 65535 : 255}
                                      yMax={cfg.totalDegrees}
                                      dmxValue={tiltDmxDisplay ?? featureState.tilt as number | undefined}
                                      onChange={setTiltCurve}
                                      onDragPreview={handleTiltDragPreview}
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </CategorySection>
                    );
                  })}
                </div>
              </div>

              {/* Right column: 3D Preview + DMX Output */}
              <div className="flex flex-col gap-4 sticky top-0 self-start">
                <div className="rounded-xl overflow-hidden bg-gradient-to-br from-gray-200 to-gray-400 aspect-square">
                  <FixturePreview3D
                    modelPath={def.modelPath}
                    targetHeight={def.targetHeight}
                    features={effectiveFeatures}
                    featureObjectRef={featureObjectRef}
                  />
                </div>

                {/* DMX Output panel */}
                <div className={`border rounded-lg p-3 ${dmxActive ? "border-green-800/60 bg-green-950/20" : "border-gray-700 bg-gray-900/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs uppercase tracking-wide ${dmxActive ? "text-green-400" : "text-gray-400"}`}>
                      DMX Output
                    </span>
                    <button
                      onClick={() => setDmxActive((prev) => !prev)}
                      title={dmxActive ? "Stop DMX output" : "Start DMX output"}
                      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                        dmxActive
                          ? "bg-red-900/50 text-red-400 hover:bg-red-900/70"
                          : "bg-green-900/40 text-green-400 hover:bg-green-900/60"
                      }`}
                    >
                      {dmxActive ? "\u25A0" : "\u25B6"}
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <Field label="Universe">
                      <input
                        type="number"
                        min={1}
                        max={32768}
                        value={universe}
                        onChange={(e) => setUniverse(Number(e.target.value) || 1)}
                        className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                      />
                    </Field>
                    <Field label="Address">
                      <input
                        type="number"
                        min={1}
                        max={512}
                        value={startChannel + 1}
                        onChange={(e) => setStartChannel(Math.max(0, (Number(e.target.value) || 1) - 1))}
                        className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Fixture"
          message={`Are you sure you want to delete "${fixture.label || typeLabel}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
          isPending={deleteFixture.isPending}
        />
      )}
    </div>
  );
}
