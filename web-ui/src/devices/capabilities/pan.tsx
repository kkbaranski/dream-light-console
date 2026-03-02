import { getCachedNode, readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface PanConfig {
  /** Omit for manual-only control (no DMX output). Use { coarse, fine } for 16-bit. */
  readonly dmx?: { readonly offset: number } | { readonly coarse: number; readonly fine: number };
  readonly modelNode: string;     // GLB node name (e.g. "Yoke")
  readonly totalDegrees: number;  // total range, centered at DMX 128 (e.g. 540 → ±270°)
}

const DEGREES_PER_RADIAN = Math.PI / 180;

export const pan: CapabilityDef<PanConfig> = {
  type: "pan",

  defaultState: () => ({ pan: 128 }),

  dmxChannels: (config) => {
    if (!config.dmx) return [];
    if ("coarse" in config.dmx) {
      return [{ offset: config.dmx.coarse, label: "Pan", field: "pan", encoding: { kind: "linear16" } }];
    }
    return [{ offset: config.dmx.offset, label: "Pan", field: "pan", encoding: { kind: "linear8" } }];
  },

  applyToModel: (model, obj, config) => {
    const node = getCachedNode(model, config.modelNode);
    if (!node) return;
    node.rotation.y =
      (readField<number>(obj, "pan", 128) / 255 - 0.5) * config.totalDegrees * DEGREES_PER_RADIAN;
  },

  Inspector: ({ ctx }) => (
    <>
      <SectionDivider label="Pan" />
      <ValueSlider
        label="Pan"
        value={ctx.shared((obj) => readField<number>(obj, "pan", 128)) ?? ctx.avgInt((obj) => readField<number>(obj, "pan", 128))}
        isMixed={ctx.isMixed((obj) => readField<number>(obj, "pan", 128))}
        min={0} max={255}
        locked={ctx.isLocked("pan")}
        onToggleLock={() => ctx.toggleLock("pan")}
        onChange={(v) => ctx.update({ pan: v })}
      />
    </>
  ),
};
