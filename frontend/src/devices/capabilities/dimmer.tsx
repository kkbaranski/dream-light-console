import { readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DimmerConfig {}

export const dimmer: CapabilityDef<DimmerConfig> = {
  type: "dimmer",

  defaultState: () => ({ dimmer: 255 }),

  dmxChannels: () => [
    { offset: 0, label: "Dimmer", field: "dimmer", encoding: { kind: "linear8" } },
  ],

  Inspector: ({ ctx }) => (
    <>
      <SectionDivider label="Brightness" />
      <ValueSlider
        label="Dimmer"
        value={ctx.shared((obj) => readField<number>(obj, "dimmer", 255)) ?? ctx.avgInt((obj) => readField<number>(obj, "dimmer", 255))}
        isMixed={ctx.isMixed((obj) => readField<number>(obj, "dimmer", 255))}
        min={0}
        max={255}
        locked={ctx.isLocked("dimmer")}
        onToggleLock={() => ctx.toggleLock("dimmer")}
        onChange={(v) => ctx.update({ dimmer: v })}
      />
    </>
  ),
};
