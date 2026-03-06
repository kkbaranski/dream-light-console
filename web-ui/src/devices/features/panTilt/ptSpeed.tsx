import { readField, type FeatureDef } from "../../feature";
import { ValueSlider } from "../../../components/stage/inspectorPrimitives";

export interface PtSpeedConfig {
  readonly dmx: { readonly offset: number };
}

export const ptSpeed: FeatureDef<PtSpeedConfig> = {
  type: "ptSpeed",

  defaultState: () => ({ ptSpeed: 0 }),

  dmxChannels: (config) => [
    { offset: config.dmx.offset, label: "P/T Speed", field: "ptSpeed", encoding: { kind: "linear8" } },
  ],

  Inspector: ({ ctx }) => (
    <>
      <ValueSlider
        label="Speed"
        value={ctx.shared((obj) => readField<number>(obj, "ptSpeed", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "ptSpeed", 0))}
        isMixed={ctx.isMixed((obj) => readField<number>(obj, "ptSpeed", 0))}
        min={0}
        max={255}
        locked={ctx.isLocked("ptSpeed")}
        onToggleLock={() => ctx.toggleLock("ptSpeed")}
        onChange={(v) => ctx.update({ ptSpeed: v })}
        channel={ctx.channels?.["ptSpeed"]}
        onChannelChange={ctx.onChannelChange && ((ch) => ctx.onChannelChange!("ptSpeed", ch))}
      />
      <div className="flex justify-between text-[10px] text-gray-500 px-1 -mt-1">
        <span>Fast</span>
        <span>Slow</span>
      </div>
    </>
  ),
};
