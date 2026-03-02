import { getCachedNode, readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface TiltConfig {
  /** Omit for manual-only control (no DMX output). Use { coarse, fine } for 16-bit. */
  readonly dmx?: { readonly offset: number } | { readonly coarse: number; readonly fine: number };
  readonly modelNode: string;     // GLB node name (e.g. "Head", "Base")
  readonly startDegrees: number;  // angle (degrees) at DMX value 0
  readonly totalDegrees: number;  // total rotation range in degrees
}

const DEGREES_PER_RADIAN = Math.PI / 180;

export const tilt: CapabilityDef<TiltConfig> = {
  type: "tilt",

  defaultState: () => ({ tilt: 0 }),

  dmxChannels: (config) => {
    if (!config.dmx) return [];
    if ("coarse" in config.dmx) {
      return [{ offset: config.dmx.coarse, label: "Tilt", field: "tilt", encoding: { kind: "linear16" } }];
    }
    return [{ offset: config.dmx.offset, label: "Tilt", field: "tilt", encoding: { kind: "linear8" } }];
  },

  applyToModel: (model, obj, config) => {
    const node = getCachedNode(model, config.modelNode);
    if (!node) return;
    node.rotation.x =
      (config.startDegrees + (readField<number>(obj, "tilt", 0) / 255) * config.totalDegrees) *
      DEGREES_PER_RADIAN;
  },

  Inspector: ({ ctx }) => (
    <>
      <SectionDivider label="Tilt" />
      <ValueSlider
        label="Tilt"
        value={ctx.shared((obj) => readField<number>(obj, "tilt", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "tilt", 0))}
        isMixed={ctx.isMixed((obj) => readField<number>(obj, "tilt", 0))}
        min={0} max={255}
        locked={ctx.isLocked("tilt")}
        onToggleLock={() => ctx.toggleLock("tilt")}
        onChange={(v) => ctx.update({ tilt: v })}
      />
    </>
  ),
};
