import { readField, type CapabilityDef } from "../capability";
import { SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface ColorWheelSlot {
  readonly name: string;
  readonly hex: string;
}

export interface ColorWheelConfig {
  readonly dmx: { readonly offset: number };
  readonly colors: ReadonlyArray<ColorWheelSlot>;
  readonly defaultIndex: number;
}

function slotToDmxValue(slotIndex: number, totalSlots: number): number {
  return Math.round((slotIndex / Math.max(1, totalSlots - 1)) * 255);
}

export const colorWheel: CapabilityDef<ColorWheelConfig> = {
  type: "colorWheel",

  defaultState: (config) => ({ colorWheelIndex: config.defaultIndex }),

  dmxChannels: (config) => [
    {
      offset: config.dmx.offset,
      label: "Color Wheel",
      field: "colorWheelIndex",
      encoding: {
        kind: "step",
        steps: config.colors.map((slot, index) => ({
          dmxValue: slotToDmxValue(index, config.colors.length),
          label: slot.name,
        })),
      },
    },
  ],

  Inspector: ({ ctx, config }) => {
    const index = readField<number>(ctx.selected[0], "colorWheelIndex", config.defaultIndex);
    return (
      <>
        <SectionDivider label="Color" />
        <div className="flex flex-wrap gap-1.5">
          {config.colors.map((slot, i) => (
            <button
              key={slot.name}
              title={slot.name}
              onClick={() => ctx.update({ colorWheelIndex: i })}
              style={{ backgroundColor: slot.hex }}
              className={`w-6 h-6 rounded-full border-2 transition-colors ${
                i === index ? "border-white" : "border-transparent"
              }`}
            />
          ))}
        </div>
      </>
    );
  },
};
