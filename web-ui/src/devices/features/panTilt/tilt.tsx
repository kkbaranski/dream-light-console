import { getCachedNode, readField, DEG2RAD, type FeatureDef } from "../../feature";
import { Value16BitSlider, ValueSlider, GearButton } from "../../../components/stage/inspectorPrimitives";
import { createSpline, type CurvePoint } from "../../../lib/cubicSpline";

export interface TiltConfig {
  /** Omit for manual-only control (no DMX output). Use { coarse, fine } for 16-bit. */
  readonly dmx?: { readonly offset: number } | { readonly coarse: number; readonly fine: number };
  readonly modelNode: string;     // GLB node name (e.g. "Head", "Base")
  readonly startDegrees: number;  // angle (degrees) at DMX value 0
  readonly totalDegrees: number;  // total rotation range in degrees
  readonly responseCurve?: ReadonlyArray<CurvePoint>;
}

export const tilt: FeatureDef<TiltConfig> = {
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
    const maxValue = config.dmx && "coarse" in config.dmx ? 65535 : 255;
    const raw = readField<number>(obj, "tilt", 0);

    let angleDeg: number;
    if (config.responseCurve && config.responseCurve.length >= 2) {
      let evaluate: (x: number) => number = node.userData._tiltSpline;
      if (!evaluate || node.userData._tiltSplinePoints !== config.responseCurve) {
        evaluate = createSpline(config.responseCurve, { min: 0, max: config.totalDegrees });
        node.userData._tiltSpline = evaluate;
        node.userData._tiltSplinePoints = config.responseCurve;
      }
      angleDeg = config.startDegrees + evaluate(raw);
    } else {
      angleDeg = config.startDegrees + (raw / maxValue) * config.totalDegrees;
    }

    node.rotation.x = -angleDeg * DEG2RAD;
  },

  Inspector: ({ ctx, config }) => {
    const is16bit = !!(config.dmx && "coarse" in config.dmx);
    const value = ctx.shared((obj) => readField<number>(obj, "tilt", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "tilt", 0));
    const mixed = ctx.isMixed((obj) => readField<number>(obj, "tilt", 0));

    const gear = ctx.onToggleConfig
      ? <GearButton open={ctx.configOpen?.tilt} onClick={() => ctx.onToggleConfig!("tilt")} />
      : undefined;

    return is16bit ? (
      <Value16BitSlider
        label="Tilt"
        value={value}
        isMixed={mixed}
        locked={ctx.isLocked("tilt")}
        onToggleLock={() => ctx.toggleLock("tilt")}
        onChange={(v) => ctx.update({ tilt: v })}
        coarseChannel={ctx.channels?.["tilt:coarse"]}
        fineChannel={ctx.channels?.["tilt:fine"]}
        onCoarseChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("tilt:coarse", ch))}
        onFineChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("tilt:fine", ch))}
        lockedCoarse={ctx.isLocked("tilt:coarse")}
        lockedFine={ctx.isLocked("tilt:fine")}
        onToggleCoarseLock={() => ctx.toggleLock("tilt:coarse")}
        onToggleFineLock={() => ctx.toggleLock("tilt:fine")}
        headerExtra={gear}
      />
    ) : (
      <ValueSlider
        label="Tilt"
        value={value}
        isMixed={mixed}
        min={0} max={255}
        locked={ctx.isLocked("tilt")}
        onToggleLock={() => ctx.toggleLock("tilt")}
        onChange={(v) => ctx.update({ tilt: v })}
        channel={ctx.channels?.["tilt"]}
        onChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("tilt", ch))}
        headerExtra={gear}
      />
    );
  },
};
