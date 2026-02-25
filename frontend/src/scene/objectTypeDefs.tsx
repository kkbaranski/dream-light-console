import React from "react";
import {
  DraggableField,
  ValueSlider,
  SectionDivider,
  LockButton,
  ColorSection,
  PositionRow,
  PowerIcon,
} from "../components/stage/inspectorPrimitives";
import type {
  SceneObject,
  SceneObjectType,
  MovingHeadObject,
  TripodObject,
  TripodWithBarObject,
  PropObject,
  ObjectPatch,
} from "./types";

// ─── Inspector Section Context ────────────────────────────────────────────────

export interface InspectorSectionContext<T extends SceneObject> {
  selected: T[];
  shared: <V>(getter: (object: T) => V) => V | null;
  isMixed: <V>(getter: (object: T) => V) => boolean;
  avgInt: (getter: (object: T) => number) => number;
  avgFloat: (getter: (object: T) => number, decimals?: number) => number;
  update: (patch: ObjectPatch<T>) => void;
  move: (movements: { id: string; position: [number, number, number] }[]) => void;
  isLocked: (field: string) => boolean;
  toggleLock: (field: string) => void;
}

// ─── Section / Type Def shapes ────────────────────────────────────────────────

export interface InspectorSectionDef<T extends SceneObject> {
  key: string;
  render: (ctx: InspectorSectionContext<T>) => React.ReactNode;
}

export interface ObjectTypeDef<T extends SceneObject> {
  readonly type: T["type"];
  readonly label: string;
  readonly supportsMultiSelect: boolean;
  readonly supportsCopyPaste: boolean;
  readonly supportsGroupDrag: boolean;
  readonly supportsFieldLocks: boolean;
  readonly defaults: Omit<T, "id" | "type" | "position">;
  headerAction?: (ctx: InspectorSectionContext<T>) => React.ReactNode;
  readonly inspectorSections: ReadonlyArray<InspectorSectionDef<T>>;
}

type ObjectTypeDefRegistry = {
  [K in SceneObjectType]: ObjectTypeDef<Extract<SceneObject, { type: K }>>;
};

// ─── Moving Head Sections ─────────────────────────────────────────────────────

const nameSection: InspectorSectionDef<MovingHeadObject> = {
  key: "name",
  render: (ctx) => {
    const sharedName = ctx.shared((l) => l.name);
    return (
      <input
        type="text"
        value={sharedName ?? ""}
        placeholder={sharedName === null ? "Multiple values" : "Name"}
        onChange={(event) => ctx.update({ name: event.target.value })}
        className="w-full bg-gray-800 text-xs text-gray-200 rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600"
      />
    );
  },
};

const brightnessSection: InspectorSectionDef<MovingHeadObject> = {
  key: "brightness",
  render: (ctx) => (
    <>
      <SectionDivider label="Brightness" />
      <ValueSlider
        label="Dimmer"
        value={ctx.shared((l) => l.dimmer) ?? ctx.avgInt((l) => l.dimmer)}
        isMixed={ctx.isMixed((l) => l.dimmer)}
        min={0}
        max={255}
        locked={ctx.isLocked("dimmer")}
        onToggleLock={() => ctx.toggleLock("dimmer")}
        onChange={(value) => ctx.update({ dimmer: value })}
      />
    </>
  ),
};

const colorSection: InspectorSectionDef<MovingHeadObject> = {
  key: "color",
  render: (ctx) => {
    const sharedColor = ctx.shared((l) => l.color);
    return (
      <>
        <SectionDivider label="Color" />
        <ColorSection
          color={sharedColor ?? ctx.selected[0].color}
          isMixed={sharedColor === null}
          locked={ctx.isLocked("color")}
          onToggleLock={() => ctx.toggleLock("color")}
          onChange={(hex) => ctx.update({ color: hex })}
        />
      </>
    );
  },
};

const headSection: InspectorSectionDef<MovingHeadObject> = {
  key: "head",
  render: (ctx) => (
    <>
      <SectionDivider label="Head" />
      <div className="flex flex-col gap-2">
        <ValueSlider
          label="Pan"
          value={ctx.shared((l) => l.pan) ?? ctx.avgInt((l) => l.pan)}
          isMixed={ctx.isMixed((l) => l.pan)}
          min={0}
          max={255}
          locked={ctx.isLocked("pan")}
          onToggleLock={() => ctx.toggleLock("pan")}
          onChange={(value) => ctx.update({ pan: value })}
        />
        <ValueSlider
          label="Tilt"
          value={ctx.shared((l) => l.tilt) ?? ctx.avgInt((l) => l.tilt)}
          isMixed={ctx.isMixed((l) => l.tilt)}
          min={0}
          max={255}
          locked={ctx.isLocked("tilt")}
          onToggleLock={() => ctx.toggleLock("tilt")}
          onChange={(value) => ctx.update({ tilt: value })}
        />
        <ValueSlider
          label="Beam angle"
          value={ctx.shared((l) => l.coneAngle) ?? ctx.avgInt((l) => l.coneAngle)}
          isMixed={ctx.isMixed((l) => l.coneAngle)}
          min={1}
          max={60}
          unit="°"
          locked={ctx.isLocked("coneAngle")}
          onToggleLock={() => ctx.toggleLock("coneAngle")}
          onChange={(value) => ctx.update({ coneAngle: value })}
        />
      </div>
    </>
  ),
};

const transformSection: InspectorSectionDef<MovingHeadObject> = {
  key: "transform",
  render: (ctx) => {
    const sharedPosX = ctx.shared((l) => l.position[0]);
    const sharedPosY = ctx.shared((l) => l.position[1]);
    const sharedPosZ = ctx.shared((l) => l.position[2]);
    const sharedRotX = ctx.shared((l) => l.rotationX);
    const sharedRotY = ctx.shared((l) => l.rotationY);
    const sharedRotZ = ctx.shared((l) => l.rotationZ);

    const posX = sharedPosX ?? ctx.avgFloat((l) => l.position[0]);
    const posY = sharedPosY ?? ctx.avgFloat((l) => l.position[1]);
    const posZ = sharedPosZ ?? ctx.avgFloat((l) => l.position[2]);
    const rotX = sharedRotX ?? ctx.avgFloat((l) => l.rotationX, 1);
    const rotY = sharedRotY ?? ctx.avgFloat((l) => l.rotationY, 1);
    const rotZ = sharedRotZ ?? ctx.avgFloat((l) => l.rotationZ, 1);

    function updatePositionAxis(axis: 0 | 1 | 2, value: number) {
      ctx.move(
        ctx.selected.map((light) => ({
          id: light.id,
          position: [
            axis === 0 ? value : light.position[0],
            axis === 1 ? value : light.position[1],
            axis === 2 ? value : light.position[2],
          ] as [number, number, number],
        })),
      );
    }

    return (
      <>
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
              locked={ctx.isLocked("posX")}
              onToggleLock={() => ctx.toggleLock("posX")}
              onChange={(v) => updatePositionAxis(0, v)}
            />
            <PositionRow
              label="Y"
              value={posY}
              min={0}
              sensitivity={0.1}
              decimals={2}
              isMixed={sharedPosY === null}
              locked={ctx.isLocked("posY")}
              onToggleLock={() => ctx.toggleLock("posY")}
              onChange={(v) => updatePositionAxis(1, v)}
            />
            <PositionRow
              label="Z"
              value={posZ}
              sensitivity={0.1}
              decimals={2}
              isMixed={sharedPosZ === null}
              locked={ctx.isLocked("posZ")}
              onToggleLock={() => ctx.toggleLock("posZ")}
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
              locked={ctx.isLocked("rotationX")}
              onToggleLock={() => ctx.toggleLock("rotationX")}
              onChange={(v) => ctx.update({ rotationX: v })}
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
              locked={ctx.isLocked("rotationY")}
              onToggleLock={() => ctx.toggleLock("rotationY")}
              onChange={(v) => ctx.update({ rotationY: v })}
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
              locked={ctx.isLocked("rotationZ")}
              onToggleLock={() => ctx.toggleLock("rotationZ")}
              onChange={(v) => ctx.update({ rotationZ: v })}
            />
          </div>
        </div>
      </>
    );
  },
};

const dmxSection: InspectorSectionDef<MovingHeadObject> = {
  key: "dmx",
  render: (ctx) => {
    const sharedUniverse = ctx.shared((l) => l.universe);
    const sharedChannel = ctx.shared((l) => l.startChannel);
    return (
      <>
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
              disabled={ctx.isLocked("universe")}
              onChange={(event) =>
                ctx.update({ universe: Math.max(1, Number(event.target.value)) })
              }
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${
                ctx.isLocked("universe") ? "opacity-40 cursor-not-allowed" : ""
              }`}
            />
            <LockButton
              locked={ctx.isLocked("universe")}
              onToggle={() => ctx.toggleLock("universe")}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">Channel</span>
            <input
              type="number"
              min={1}
              max={512}
              value={sharedChannel ?? ""}
              placeholder={sharedChannel === null ? "—" : ""}
              disabled={ctx.isLocked("startChannel")}
              onChange={(event) =>
                ctx.update({ startChannel: Math.max(1, Number(event.target.value)) })
              }
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${
                ctx.isLocked("startChannel") ? "opacity-40 cursor-not-allowed" : ""
              }`}
            />
            <LockButton
              locked={ctx.isLocked("startChannel")}
              onToggle={() => ctx.toggleLock("startChannel")}
            />
          </div>
        </div>
      </>
    );
  },
};

// ─── Prop Section Helpers ─────────────────────────────────────────────────────

function makePropPositionSection<T extends PropObject>(): InspectorSectionDef<T> {
  return {
    key: "position",
    render: (ctx) => {
      function setAxis(axis: 0 | 1 | 2, value: number) {
        const prop = ctx.selected[0];
        const pos: [number, number, number] = [...prop.position];
        pos[axis] = axis === 1 ? Math.max(0, value) : value;
        ctx.move([{ id: prop.id, position: pos }]);
      }

      return (
        <>
          <SectionDivider label="Position" />
          <div className="flex flex-col gap-1.5">
            {(["X", "Y", "Z"] as const).map((axis, index) => (
              <div key={axis} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500 w-3 flex-shrink-0">{axis}</span>
                <DraggableField
                  value={ctx.selected[0].position[index]}
                  sensitivity={0.1}
                  decimals={2}
                  onChange={(v) => setAxis(index as 0 | 1 | 2, v)}
                />
              </div>
            ))}
          </div>
        </>
      );
    },
  };
}

function makeTripodHeightSection<T extends TripodObject | TripodWithBarObject>(): InspectorSectionDef<T> {
  return {
    key: "poleHeight",
    render: (ctx) => (
      <>
        <SectionDivider label="Pole Height" />
        <ValueSlider
          label="Extension"
          value={Math.round(ctx.selected[0].height * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => ctx.update({ height: v / 100 } as ObjectPatch<T>)}
        />
      </>
    ),
  };
}

// ─── Factory Helpers ──────────────────────────────────────────────────────────

function makeSimplePropDef<T extends PropObject>(
  type: T["type"],
  label: string,
  defaults: Omit<T, "id" | "type" | "position">,
): ObjectTypeDef<T> {
  return {
    type,
    label,
    supportsMultiSelect: false,
    supportsCopyPaste: false,
    supportsGroupDrag: false,
    supportsFieldLocks: false,
    defaults,
    inspectorSections: [makePropPositionSection<T>()],
  };
}

function makeTripodDef<T extends TripodObject | TripodWithBarObject>(
  type: T["type"],
  label: string,
): ObjectTypeDef<T> {
  return {
    type,
    label,
    supportsMultiSelect: false,
    supportsCopyPaste: false,
    supportsGroupDrag: false,
    supportsFieldLocks: false,
    defaults: { height: 0, lockedFields: [] } as unknown as Omit<T, "id" | "type" | "position">,
    inspectorSections: [
      makePropPositionSection<T>(),
      makeTripodHeightSection<T>(),
    ],
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const OBJECT_TYPE_DEFS = {
  moving_head: {
    type: "moving_head",
    label: "Moving Head",
    supportsMultiSelect: true,
    supportsCopyPaste: true,
    supportsGroupDrag: true,
    supportsFieldLocks: true,
    defaults: {
      name: "Moving Head",
      universe: 1,
      startChannel: 1,
      dimmer: 255,
      pan: 128,
      tilt: 128,
      color: "#ffffff",
      coneAngle: 15,
      powered: true,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      lockedFields: [],
    } satisfies Omit<MovingHeadObject, "id" | "type" | "position">,
    headerAction: (ctx: InspectorSectionContext<MovingHeadObject>) => {
      const anyPowered = ctx.selected.some((l) => l.powered);
      return (
        <button
          onClick={() => ctx.update({ powered: !anyPowered })}
          title={anyPowered ? "Turn off" : "Turn on"}
          className={`transition-colors ${
            anyPowered ? "text-yellow-400 hover:text-yellow-300" : "text-gray-600 hover:text-gray-400"
          }`}
        >
          <PowerIcon />
        </button>
      );
    },
    inspectorSections: [
      nameSection,
      brightnessSection,
      colorSection,
      headSection,
      transformSection,
      dmxSection,
    ],
  },
  speaker_1: makeSimplePropDef("speaker_1", "Speaker 1", { lockedFields: [] }),
  speaker_2: makeSimplePropDef("speaker_2", "Speaker 2", { lockedFields: [] }),
  tripod: makeTripodDef("tripod", "Tripod"),
  tripod_with_bar: makeTripodDef("tripod_with_bar", "Tripod w/ Bar"),
  mic: makeSimplePropDef("mic", "Microphone", { lockedFields: [] }),
  barricade: makeSimplePropDef("barricade", "Barricade", { lockedFields: [] }),
  disco_ball: makeSimplePropDef("disco_ball", "Disco Ball", { lockedFields: [] }),
  disco_ball2: makeSimplePropDef("disco_ball2", "Disco Ball 2", { lockedFields: [] }),
} satisfies ObjectTypeDefRegistry;
