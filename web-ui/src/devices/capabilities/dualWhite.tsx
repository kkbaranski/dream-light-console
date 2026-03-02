import { readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface DualWhiteConfig {
  readonly dmx: { readonly warm: number; readonly cold: number };
  readonly warmColorHex: string;
  readonly coldColorHex: string;
}

export const dualWhite: CapabilityDef<DualWhiteConfig> = {
  type: "dualWhite",

  defaultState: () => ({ warmLevel: 0, coldLevel: 255 }),

  dmxChannels: (config) => [
    { offset: config.dmx.warm, label: "Warm White", field: "warmLevel", encoding: { kind: "linear8" } },
    { offset: config.dmx.cold, label: "Cold White", field: "coldLevel", encoding: { kind: "linear8" } },
  ],

  Inspector: ({ ctx }) => (
    <>
      <SectionDivider label="White Balance" />
      <div className="flex flex-col gap-2">
        <ValueSlider
          label="Warm"
          value={ctx.shared((obj) => readField<number>(obj, "warmLevel", 0)) ?? ctx.avgInt((obj) => readField<number>(obj, "warmLevel", 0))}
          isMixed={ctx.isMixed((obj) => readField<number>(obj, "warmLevel", 0))}
          min={0} max={255}
          locked={ctx.isLocked("warmLevel")}
          onToggleLock={() => ctx.toggleLock("warmLevel")}
          onChange={(v) => ctx.update({ warmLevel: v })}
        />
        <ValueSlider
          label="Cold"
          value={ctx.shared((obj) => readField<number>(obj, "coldLevel", 255)) ?? ctx.avgInt((obj) => readField<number>(obj, "coldLevel", 255))}
          isMixed={ctx.isMixed((obj) => readField<number>(obj, "coldLevel", 255))}
          min={0} max={255}
          locked={ctx.isLocked("coldLevel")}
          onToggleLock={() => ctx.toggleLock("coldLevel")}
          onChange={(v) => ctx.update({ coldLevel: v })}
        />
      </div>
    </>
  ),
};
