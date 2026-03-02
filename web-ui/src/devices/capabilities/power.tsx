import { readField, type CapabilityDef } from "../capability";
import { PowerIcon } from "../../components/stage/inspectorPrimitives";

export interface PowerConfig {}

export const power: CapabilityDef<PowerConfig> = {
  type: "power",

  defaultState: () => ({ powered: false }),

  headerWidget: ({ ctx }) => {
    const anyPowered = ctx.selected.some((obj) => readField<boolean>(obj, "powered", false));
    return (
      <button
        onClick={() => ctx.update({ powered: !anyPowered })}
        title={anyPowered ? "Turn off" : "Turn on"}
        className={`transition-colors ${
          anyPowered
            ? "text-yellow-400 hover:text-yellow-300"
            : "text-gray-600 hover:text-gray-400"
        }`}
      >
        <PowerIcon />
      </button>
    );
  },
};
