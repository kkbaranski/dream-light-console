import { readField, type FeatureDef } from "../../feature";
import { ColorSection } from "../../../components/stage/inspectorPrimitives";

export interface RgbColorConfig {
  /** 0-based offsets. red, green, blue must be consecutive (rgbHex encoding spans 3 slots from red). */
  readonly dmx: { readonly red: number; readonly green: number; readonly blue: number };
  readonly defaultColor: string;
}

export const rgbColor: FeatureDef<RgbColorConfig> = {
  type: "rgbColor",

  defaultState: (config) => ({ color: config.defaultColor }),

  dmxChannels: (config) => [
    { offset: config.dmx.red, label: "Color (RGB)", field: "color", encoding: { kind: "rgbHex" } },
  ],

  Inspector: ({ ctx, config }) => {
    const shared = ctx.shared((obj) => readField<string>(obj, "color", config.defaultColor));
    return (
      <ColorSection
        color={shared ?? readField<string>(ctx.selected[0], "color", config.defaultColor)}
        isMixed={shared === null}
        locked={ctx.isLocked("color")}
        onToggleLock={() => ctx.toggleLock("color")}
        onChange={(hex) => ctx.update({ color: hex })}
      />
    );
  },
};
