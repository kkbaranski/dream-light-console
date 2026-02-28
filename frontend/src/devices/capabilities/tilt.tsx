import { getCachedNode, readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface TiltCapabilityConfig {
  readonly nodeName: string;
  /**
   * Innermost node used as the beam emission point.
   * Useful when the rotating node (nodeName) is the pivot but the actual
   * lens sits deeper in the hierarchy (e.g. Yoke → Base → Bulb).
   * Defaults to nodeName when omitted.
   */
  readonly beamOriginNodeName?: string;
  readonly startDegrees: number;
  readonly totalDegrees: number;
}

const DEGREES_PER_RADIAN = Math.PI / 180;

export const tilt: CapabilityDef<TiltCapabilityConfig> = {
  type: "tilt",

  defaultState: () => ({ tilt: 0 }),

  applyToModel: (model, obj, config) => {
    const node = getCachedNode(model, config.nodeName);
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
