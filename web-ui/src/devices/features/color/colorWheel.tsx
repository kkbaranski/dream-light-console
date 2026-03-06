import { readField, type FeatureDef } from "../../feature";
import { ChannelInput, LockButton, GearButton } from "../../../components/stage/inspectorPrimitives";

export interface ColorWheelSlot {
  readonly name: string;
  readonly hex: string;
  readonly dmxStart: number;
  readonly dmxEnd: number;
}

export interface ColorWheelConfig {
  readonly dmx: { readonly offset: number };
  readonly colors: ReadonlyArray<ColorWheelSlot>;
  readonly defaultIndex: number;
}

export const colorWheel: FeatureDef<ColorWheelConfig> = {
  type: "colorWheel",

  defaultState: (config) => ({
    colorWheelIndex: Math.min(config.defaultIndex, config.colors.length - 1),
  }),

  dmxChannels: (config) => [
    {
      offset: config.dmx.offset,
      label: "Color Wheel",
      field: "colorWheelIndex",
      encoding: {
        kind: "step",
        steps: config.colors.map((slot) => ({
          dmxValue: slot.dmxStart,
          label: slot.name,
        })),
      },
    },
  ],

  Inspector: ({ ctx, config }) => {
    const index = readField<number>(ctx.selected[0], "colorWheelIndex", config.defaultIndex);
    const ch = ctx.channels?.["colorWheelIndex"];
    const locked = ctx.isLocked("colorWheelIndex");
    return (
      <>
        <div className="flex items-center gap-1.5 mb-1.5">
          {ch != null && (
            <ChannelInput
              channel={ch}
              onChange={ctx.onChannelChange && ((c) => ctx.onChannelChange!("colorWheelIndex", c))}
            />
          )}
          <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
            Color Wheel
          </span>
          {ctx.onToggleConfig && (
            <GearButton open={ctx.configOpen?.colorWheel} onClick={() => ctx.onToggleConfig!("colorWheel")} />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {config.colors.map((slot, i) => (
            <button
              key={slot.name}
              title={slot.name}
              disabled={locked}
              onClick={() => ctx.update({ colorWheelIndex: i })}
              style={{ backgroundColor: slot.hex }}
              className={`w-6 h-6 rounded-full border-2 transition-colors ${
                i === index ? "border-white" : "border-transparent"
              } ${locked ? "opacity-40" : ""}`}
            />
          ))}
          <LockButton locked={locked} onToggle={() => ctx.toggleLock("colorWheelIndex")} />
        </div>
      </>
    );
  },
};
