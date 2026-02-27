/**
 * Inspector sections and object type metadata — all auto-generated from DEVICE_REGISTRY.
 *
 * Adding a new device type requires zero changes here. The sections that appear
 * in the inspector are determined entirely by the capabilities declared in registry.ts.
 */
import React from "react";
import {
  ValueSlider,
  SectionDivider,
  LockButton,
  ColorSection,
  PositionRow,
  PowerIcon,
} from "../components/stage/inspectorPrimitives";
import { DEVICE_REGISTRY } from "../devices/registry";
import type { DeviceDef } from "../devices/registry";
import type { ColorWheelCapDef } from "../devices/capabilities";
import type { SceneObject, SceneObjectType } from "./types";

// ── Context ───────────────────────────────────────────────────────────────────

export interface InspectorSectionContext {
  selected: SceneObject[];
  shared: <V>(getter: (object: SceneObject) => V) => V | null;
  isMixed: <V>(getter: (object: SceneObject) => V) => boolean;
  avgInt: (getter: (object: SceneObject) => number) => number;
  avgFloat: (getter: (object: SceneObject) => number, decimals?: number) => number;
  update: (patch: Record<string, unknown>) => void;
  move: (movements: { id: string; position: [number, number, number] }[]) => void;
  isLocked: (field: string) => boolean;
  toggleLock: (field: string) => void;
}

export interface InspectorSectionDef {
  key: string;
  render: (ctx: InspectorSectionContext) => React.ReactNode;
}

export interface ObjectTypeDef {
  readonly label: string;
  readonly supportsMultiSelect: boolean;
  readonly supportsCopyPaste: boolean;
  readonly supportsGroupDrag: boolean;
  readonly supportsFieldLocks: boolean;
  headerAction?: (ctx: InspectorSectionContext) => React.ReactNode;
  readonly inspectorSections: ReadonlyArray<InspectorSectionDef>;
}

// ── Generic field reader ───────────────────────────────────────────────────────
// Read any capability field from a SceneObject without requiring a specific type.

function f<V>(object: SceneObject, name: string, fallback: V): V {
  const v = (object as unknown as Record<string, unknown>)[name];
  return v !== undefined ? (v as V) : fallback;
}

// ── Section factories ──────────────────────────────────────────────────────────

function makeNameSection(): InspectorSectionDef {
  return {
    key: "name",
    render: (ctx) => {
      const value = ctx.shared((o) => f(o, "name", "")) ?? "";
      const isMixed = ctx.isMixed((o) => f(o, "name", ""));
      return (
        <input
          type="text"
          value={value}
          placeholder={isMixed ? "Multiple values" : "Name"}
          onChange={(event) => ctx.update({ name: event.target.value })}
          className="w-full bg-gray-800 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600"
        />
      );
    },
  };
}

function makeBrightnessSection(): InspectorSectionDef {
  return {
    key: "brightness",
    render: (ctx) => (
      <>
        <SectionDivider label="Brightness" />
        <ValueSlider
          label="Dimmer"
          value={ctx.shared((o) => f(o, "dimmer", 255)) ?? ctx.avgInt((o) => f(o, "dimmer", 255))}
          isMixed={ctx.isMixed((o) => f(o, "dimmer", 255))}
          min={0}
          max={255}
          locked={ctx.isLocked("dimmer")}
          onToggleLock={() => ctx.toggleLock("dimmer")}
          onChange={(v) => ctx.update({ dimmer: v })}
        />
      </>
    ),
  };
}

function makeRgbColorSection(): InspectorSectionDef {
  return {
    key: "color",
    render: (ctx) => {
      const shared = ctx.shared((o) => f(o, "color", "#ffffff"));
      return (
        <>
          <SectionDivider label="Color" />
          <ColorSection
            color={shared ?? f(ctx.selected[0], "color", "#ffffff")}
            isMixed={shared === null}
            locked={ctx.isLocked("color")}
            onToggleLock={() => ctx.toggleLock("color")}
            onChange={(hex) => ctx.update({ color: hex })}
          />
        </>
      );
    },
  };
}

function makeColorWheelSection(cap: ColorWheelCapDef): InspectorSectionDef {
  return {
    key: "colorWheel",
    render: (ctx) => {
      const index = f(ctx.selected[0], "colorWheelIndex", cap.defaultIndex);
      return (
        <>
          <SectionDivider label="Color" />
          <div className="flex flex-wrap gap-1.5">
            {cap.colors.map((slot, i) => (
              <button
                key={slot.name}
                title={slot.name}
                onClick={() => ctx.update({ colorWheelIndex: i })}
                style={{ backgroundColor: slot.hex }}
                className={`w-6 h-6 rounded-full border-2 transition-colors ${
                  i === index ? "border-white" : "border-transparent"
                }`}
              />
            ))}
          </div>
        </>
      );
    },
  };
}

function makeDualWhiteSection(): InspectorSectionDef {
  return {
    key: "dualWhite",
    render: (ctx) => (
      <>
        <SectionDivider label="White Balance" />
        <div className="flex flex-col gap-2">
          <ValueSlider
            label="Warm"
            value={ctx.shared((o) => f(o, "warmLevel", 0)) ?? ctx.avgInt((o) => f(o, "warmLevel", 0))}
            isMixed={ctx.isMixed((o) => f(o, "warmLevel", 0))}
            min={0}
            max={255}
            locked={ctx.isLocked("warmLevel")}
            onToggleLock={() => ctx.toggleLock("warmLevel")}
            onChange={(v) => ctx.update({ warmLevel: v })}
          />
          <ValueSlider
            label="Cold"
            value={ctx.shared((o) => f(o, "coldLevel", 255)) ?? ctx.avgInt((o) => f(o, "coldLevel", 255))}
            isMixed={ctx.isMixed((o) => f(o, "coldLevel", 255))}
            min={0}
            max={255}
            locked={ctx.isLocked("coldLevel")}
            onToggleLock={() => ctx.toggleLock("coldLevel")}
            onChange={(v) => ctx.update({ coldLevel: v })}
          />
        </div>
      </>
    ),
  };
}

function makeHeadSection(
  hasPan: boolean,
  hasTilt: boolean,
  coneAngleCap: { min: number; max: number; default: number } | undefined,
): InspectorSectionDef {
  return {
    key: "head",
    render: (ctx) => (
      <>
        <SectionDivider label="Head" />
        <div className="flex flex-col gap-2">
          {hasPan && (
            <ValueSlider
              label="Pan"
              value={ctx.shared((o) => f(o, "pan", 128)) ?? ctx.avgInt((o) => f(o, "pan", 128))}
              isMixed={ctx.isMixed((o) => f(o, "pan", 128))}
              min={0} max={255}
              locked={ctx.isLocked("pan")}
              onToggleLock={() => ctx.toggleLock("pan")}
              onChange={(v) => ctx.update({ pan: v })}
            />
          )}
          {hasTilt && (
            <ValueSlider
              label="Tilt"
              value={ctx.shared((o) => f(o, "tilt", 128)) ?? ctx.avgInt((o) => f(o, "tilt", 128))}
              isMixed={ctx.isMixed((o) => f(o, "tilt", 128))}
              min={0} max={255}
              locked={ctx.isLocked("tilt")}
              onToggleLock={() => ctx.toggleLock("tilt")}
              onChange={(v) => ctx.update({ tilt: v })}
            />
          )}
          {coneAngleCap && (
            <ValueSlider
              label="Beam angle"
              value={
                ctx.shared((o) => f(o, "coneAngle", coneAngleCap.default)) ??
                ctx.avgInt((o) => f(o, "coneAngle", coneAngleCap.default))
              }
              isMixed={ctx.isMixed((o) => f(o, "coneAngle", coneAngleCap.default))}
              min={coneAngleCap.min}
              max={coneAngleCap.max}
              unit="°"
              locked={ctx.isLocked("coneAngle")}
              onToggleLock={() => ctx.toggleLock("coneAngle")}
              onChange={(v) => ctx.update({ coneAngle: v })}
            />
          )}
        </div>
      </>
    ),
  };
}

function makeHeightSection(): InspectorSectionDef {
  return {
    key: "poleHeight",
    render: (ctx) => (
      <>
        <SectionDivider label="Pole Height" />
        <ValueSlider
          label="Extension"
          value={Math.round(f(ctx.selected[0], "height", 0) * 100)}
          min={0} max={100} unit="%"
          onChange={(v) => ctx.update({ height: v / 100 })}
        />
      </>
    ),
  };
}

function makeTransformSection(): InspectorSectionDef {
  return {
    key: "transform",
    render: (ctx) => {
      const sharedPosX = ctx.shared((o) => o.position[0]);
      const sharedPosY = ctx.shared((o) => o.position[1]);
      const sharedPosZ = ctx.shared((o) => o.position[2]);
      const sharedRotX = ctx.shared((o) => f(o, "rotationX", 0));
      const sharedRotY = ctx.shared((o) => f(o, "rotationY", 0));
      const sharedRotZ = ctx.shared((o) => f(o, "rotationZ", 0));

      const posX = sharedPosX ?? ctx.avgFloat((o) => o.position[0]);
      const posY = sharedPosY ?? ctx.avgFloat((o) => o.position[1]);
      const posZ = sharedPosZ ?? ctx.avgFloat((o) => o.position[2]);
      const rotX = sharedRotX ?? ctx.avgFloat((o) => f(o, "rotationX", 0), 1);
      const rotY = sharedRotY ?? ctx.avgFloat((o) => f(o, "rotationY", 0), 1);
      const rotZ = sharedRotZ ?? ctx.avgFloat((o) => f(o, "rotationZ", 0), 1);

      function updateAxis(axis: 0 | 1 | 2, value: number) {
        ctx.move(ctx.selected.map((o) => ({
          id: o.id,
          position: [
            axis === 0 ? value : o.position[0],
            axis === 1 ? Math.max(0, value) : o.position[1],
            axis === 2 ? value : o.position[2],
          ] as [number, number, number],
        })));
      }

      return (
        <>
          <SectionDivider label="Position" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">World</span>
              <PositionRow label="X" value={posX} sensitivity={0.1} decimals={2}
                isMixed={sharedPosX === null}
                locked={ctx.isLocked("posX")} onToggleLock={() => ctx.toggleLock("posX")}
                onChange={(v) => updateAxis(0, v)} />
              <PositionRow label="Y" value={posY} min={0} sensitivity={0.1} decimals={2}
                isMixed={sharedPosY === null}
                locked={ctx.isLocked("posY")} onToggleLock={() => ctx.toggleLock("posY")}
                onChange={(v) => updateAxis(1, v)} />
              <PositionRow label="Z" value={posZ} sensitivity={0.1} decimals={2}
                isMixed={sharedPosZ === null}
                locked={ctx.isLocked("posZ")} onToggleLock={() => ctx.toggleLock("posZ")}
                onChange={(v) => updateAxis(2, v)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">Rotation</span>
              <PositionRow label="X" value={rotX} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
                isMixed={sharedRotX === null}
                locked={ctx.isLocked("rotationX")} onToggleLock={() => ctx.toggleLock("rotationX")}
                onChange={(v) => ctx.update({ rotationX: v })} />
              <PositionRow label="Y" value={rotY} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
                isMixed={sharedRotY === null}
                locked={ctx.isLocked("rotationY")} onToggleLock={() => ctx.toggleLock("rotationY")}
                onChange={(v) => ctx.update({ rotationY: v })} />
              <PositionRow label="Z" value={rotZ} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
                isMixed={sharedRotZ === null}
                locked={ctx.isLocked("rotationZ")} onToggleLock={() => ctx.toggleLock("rotationZ")}
                onChange={(v) => ctx.update({ rotationZ: v })} />
            </div>
          </div>
        </>
      );
    },
  };
}

function makeDmxSection(): InspectorSectionDef {
  return {
    key: "dmx",
    render: (ctx) => {
      const sharedUniverse = ctx.shared((o) => f(o, "universe", 1));
      const sharedChannel  = ctx.shared((o) => f(o, "startChannel", 1));
      return (
        <>
          <SectionDivider label="DMX" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 flex-shrink-0">Universe</span>
              <input
                type="number" min={1} max={16}
                value={sharedUniverse ?? ""}
                placeholder={sharedUniverse === null ? "—" : ""}
                disabled={ctx.isLocked("universe")}
                onChange={(e) => ctx.update({ universe: Math.max(1, Number(e.target.value)) })}
                className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${ctx.isLocked("universe") ? "opacity-40 cursor-not-allowed" : ""}`}
              />
              <LockButton locked={ctx.isLocked("universe")} onToggle={() => ctx.toggleLock("universe")} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 flex-shrink-0">Channel</span>
              <input
                type="number" min={1} max={512}
                value={sharedChannel ?? ""}
                placeholder={sharedChannel === null ? "—" : ""}
                disabled={ctx.isLocked("startChannel")}
                onChange={(e) => ctx.update({ startChannel: Math.max(1, Number(e.target.value)) })}
                className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${ctx.isLocked("startChannel") ? "opacity-40 cursor-not-allowed" : ""}`}
              />
              <LockButton locked={ctx.isLocked("startChannel")} onToggle={() => ctx.toggleLock("startChannel")} />
            </div>
          </div>
        </>
      );
    },
  };
}

// ── Builder ────────────────────────────────────────────────────────────────────

function buildObjectTypeDef(type: SceneObjectType): ObjectTypeDef {
  const def = DEVICE_REGISTRY[type] as DeviceDef;
  const sections: InspectorSectionDef[] = [];

  if (typeof def.defaults.name === "string")    sections.push(makeNameSection());
  if (def.beam)                                 sections.push(makeBrightnessSection());
  if (def.rgbColor)                             sections.push(makeRgbColorSection());
  if (def.colorWheel)                           sections.push(makeColorWheelSection(def.colorWheel));
  if (def.dualWhite)                            sections.push(makeDualWhiteSection());
  if (def.pan || def.tilt)                      sections.push(makeHeadSection(!!def.pan, !!def.tilt, def.beam?.coneAngle));
  if (def.innerPole)                            sections.push(makeHeightSection());
  sections.push(makeTransformSection());
  if (typeof def.defaults.universe === "number") sections.push(makeDmxSection());

  const hasPower = !!def.beam;

  return {
    label: def.label,
    supportsMultiSelect:  def.supportsAdditiveSelect,
    supportsCopyPaste:    def.supportsCopyPaste,
    supportsGroupDrag:    def.supportsGroupDrag,
    supportsFieldLocks:   def.supportsAdditiveSelect,
    headerAction: hasPower
      ? (ctx) => {
          const anyPowered = ctx.selected.some((o) => f(o, "powered", true));
          return (
            <button
              onClick={() => ctx.update({ powered: !anyPowered })}
              title={anyPowered ? "Turn off" : "Turn on"}
              className={`transition-colors ${anyPowered ? "text-yellow-400 hover:text-yellow-300" : "text-gray-600 hover:text-gray-400"}`}
            >
              <PowerIcon />
            </button>
          );
        }
      : undefined,
    inspectorSections: sections,
  };
}

// ── Registry — auto-generated, covers every type in DEVICE_REGISTRY ────────────

export const OBJECT_TYPE_DEFS = Object.fromEntries(
  (Object.keys(DEVICE_REGISTRY) as SceneObjectType[]).map((type) => [
    type,
    buildObjectTypeDef(type),
  ]),
) as Record<SceneObjectType, ObjectTypeDef>;
