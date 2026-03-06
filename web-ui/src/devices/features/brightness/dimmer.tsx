import { readField, type FeatureDef } from "../../feature";
import { ValueSlider } from "../../../components/stage/inspectorPrimitives";

export interface DimmerConfig {
  readonly dmx: { readonly offset: number };
}

export const dimmer: FeatureDef<DimmerConfig> = {
  type: "dimmer",

  defaultState: () => ({ dimmer: 0 }),

  dmxChannels: (config) => [
    { offset: config.dmx.offset, label: "Dimmer", field: "dimmer", encoding: { kind: "linear8" } },
  ],

  Inspector: ({ ctx }) => (
    <ValueSlider
        label="Dimmer"
        value={ctx.shared((obj) => readField<number>(obj, "dimmer", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "dimmer", 0))}
        isMixed={ctx.isMixed((obj) => readField<number>(obj, "dimmer", 0))}
        min={0}
        max={255}
        locked={ctx.isLocked("dimmer")}
        onToggleLock={() => ctx.toggleLock("dimmer")}
        onChange={(v) => ctx.update({ dimmer: v })}
        channel={ctx.channels?.["dimmer"]}
        onChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("dimmer", ch))}
    />
  ),
};
