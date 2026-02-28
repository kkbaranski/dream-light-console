import { getCachedNode, readField, type CapabilityDef, type DmxChannelDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface TiltConfig {
  readonly nodeName: string;
  readonly startDegrees: number;
  readonly totalDegrees: number;
}

export interface PanTiltConfig {
  readonly panNodeName: string;
  readonly panTotalDegrees: number;
  /** Omit for pan-only devices (scanners, single-axis movers). */
  readonly tilt?: TiltConfig;
}

const DEGREES_PER_RADIAN = Math.PI / 180;

export const panTilt: CapabilityDef<PanTiltConfig> = {
  type: "panTilt",

  defaultState: (config) => ({
    pan: 128,
    ...(config.tilt ? { tilt: 0 } : {}),
  }),

  dmxChannels: (config): ReadonlyArray<DmxChannelDef> => [
    { offset: 0, label: "Pan",  field: "pan",  encoding: { kind: "linear8" } },
    ...(config.tilt
      ? [{ offset: 1, label: "Tilt", field: "tilt", encoding: { kind: "linear8" } } as DmxChannelDef]
      : []),
  ],

  applyToModel: (model, obj, config) => {
    const panNode = getCachedNode(model, config.panNodeName);
    if (panNode) {
      panNode.rotation.y =
        (readField<number>(obj, "pan", 128) / 255 - 0.5) *
        config.panTotalDegrees *
        DEGREES_PER_RADIAN;
    }

    if (config.tilt) {
      const tiltNode = getCachedNode(model, config.tilt.nodeName);
      if (tiltNode) {
        tiltNode.rotation.x =
          (config.tilt.startDegrees +
            (readField<number>(obj, "tilt", 0) / 255) * config.tilt.totalDegrees) *
          DEGREES_PER_RADIAN;
      }
    }
  },

  Inspector: ({ ctx, config }) => (
    <>
      <SectionDivider label="Head" />
      <div className="flex flex-col gap-2">
        <ValueSlider
          label="Pan"
          value={ctx.shared((obj) => readField<number>(obj, "pan", 128)) ?? ctx.avgInt((obj) => readField<number>(obj, "pan", 128))}
          isMixed={ctx.isMixed((obj) => readField<number>(obj, "pan", 128))}
          min={0} max={255}
          locked={ctx.isLocked("pan")}
          onToggleLock={() => ctx.toggleLock("pan")}
          onChange={(v) => ctx.update({ pan: v })}
        />
        {config.tilt && (
          <ValueSlider
            label="Tilt"
            value={ctx.shared((obj) => readField<number>(obj, "tilt", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "tilt", 0))}
            isMixed={ctx.isMixed((obj) => readField<number>(obj, "tilt", 0))}
            min={0} max={255}
            locked={ctx.isLocked("tilt")}
            onToggleLock={() => ctx.toggleLock("tilt")}
            onChange={(v) => ctx.update({ tilt: v })}
          />
        )}
      </div>
    </>
  ),
};
