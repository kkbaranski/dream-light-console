import { readField, type CapabilityDef } from "../capability";
import { ColorSection, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface RgbColorConfig {
  readonly defaultColor: string;
}

export const rgbColor: CapabilityDef<RgbColorConfig> = {
  type: "rgbColor",

  defaultState: (config) => ({ color: config.defaultColor }),

  dmxChannels: () => [
    { offset: 0, label: "Color (RGB)", field: "color", encoding: { kind: "rgbHex" } },
  ],

  Inspector: ({ ctx, config }) => {
    const shared = ctx.shared((obj) => readField<string>(obj, "color", config.defaultColor));
    return (
      <>
        <SectionDivider label="Color" />
        <ColorSection
          color={shared ?? readField<string>(ctx.selected[0], "color", config.defaultColor)}
          isMixed={shared === null}
          locked={ctx.isLocked("color")}
          onToggleLock={() => ctx.toggleLock("color")}
          onChange={(hex) => ctx.update({ color: hex })}
        />
      </>
    );
  },
};
