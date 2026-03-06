import {getCachedNode, readField, type FeatureDef, DEG2RAD} from "../../feature";
import { Value16BitSlider, ValueSlider, GearButton }         from "../../../components/stage/inspectorPrimitives";
import { createSpline, type CurvePoint } from "../../../lib/cubicSpline";

export interface PanConfig {
  /** Omit for manual-only control (no DMX output). Use { coarse, fine } for 16-bit. */
  readonly dmx?: { readonly offset: number } | { readonly coarse: number; readonly fine: number };
  readonly modelNode: string;     // GLB node name (e.g. "Yoke")
  readonly totalDegrees: number;  // total range, centered at DMX 128 (e.g., 540 → ±270°)
  readonly responseCurve?: ReadonlyArray<CurvePoint>;
}

export const pan: FeatureDef<PanConfig> = {
  type: "pan",

  defaultState: () => ({ pan: 0 }),

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
    const maxValue = config.dmx && "coarse" in config.dmx ? 65535 : 255;
    const raw = readField<number>(obj, "pan", 0);

    let angleDeg: number;
    if (config.responseCurve && config.responseCurve.length >= 2) {
      // Cache spline evaluator on the node to avoid rebuilding every frame
      let evaluate: (x: number) => number = node.userData._panSpline;
      if (!evaluate || node.userData._panSplinePoints !== config.responseCurve) {
        evaluate = createSpline(config.responseCurve, { min: 0, max: config.totalDegrees });
        node.userData._panSpline = evaluate;
        node.userData._panSplinePoints = config.responseCurve;
      }
      angleDeg = evaluate(raw);
    } else {
      angleDeg = (raw / maxValue) * config.totalDegrees;
    }

    node.rotation.y = angleDeg * DEG2RAD;
  },

  Inspector: ({ ctx, config }) => {
    const is16bit = (config.dmx && "coarse" in config.dmx);
    const value = ctx.shared((obj) => readField<number>(obj, "pan", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "pan", 0));
    const mixed = ctx.isMixed((obj) => readField<number>(obj, "pan", 0));

    const gear = ctx.onToggleConfig
      ? <GearButton open={ctx.configOpen?.pan} onClick={() => ctx.onToggleConfig!("pan")} />
      : undefined;

    return is16bit ? (
      <Value16BitSlider
        label="Pan"
        value={value}
        isMixed={mixed}
        locked={ctx.isLocked("pan")}
        onToggleLock={() => ctx.toggleLock("pan")}
        onChange={(v) => ctx.update({ pan: v })}
        coarseChannel={ctx.channels?.["pan:coarse"]}
        fineChannel={ctx.channels?.["pan:fine"]}
        onCoarseChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("pan:coarse", ch))}
        onFineChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("pan:fine", ch))}
        lockedCoarse={ctx.isLocked("pan:coarse")}
        lockedFine={ctx.isLocked("pan:fine")}
        onToggleCoarseLock={() => ctx.toggleLock("pan:coarse")}
        onToggleFineLock={() => ctx.toggleLock("pan:fine")}
        headerExtra={gear}
      />
    ) : (
      <ValueSlider
        label="Pan"
        value={value}
        isMixed={mixed}
        min={0} max={255}
        locked={ctx.isLocked("pan")}
        onToggleLock={() => ctx.toggleLock("pan")}
        onChange={(v) => ctx.update({ pan: v })}
        channel={ctx.channels?.["pan"]}
        onChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("pan", ch))}
        headerExtra={gear}
      />
    );
  },
};
