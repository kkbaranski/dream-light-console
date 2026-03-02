import { LockButton, SectionDivider } from "../../components/stage/inspectorPrimitives";
import { readField, type CapabilityDef } from "../capability";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DmxConfig {}

export const dmx: CapabilityDef<DmxConfig> = {
  type: "dmx",

  defaultState: () => ({ universe: 1, startChannel: 1 }),

  Inspector: ({ ctx }) => {
    const sharedUniverse = ctx.shared((obj) => readField<number>(obj, "universe", 1));
    const sharedChannel  = ctx.shared((obj) => readField<number>(obj, "startChannel", 1));
    return (
      <>
        <SectionDivider label="DMX" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">Universe</span>
            <input
              type="number" min={1} max={16}
              value={sharedUniverse ?? ""}
              placeholder={sharedUniverse === null ? "—" : ""}
              disabled={ctx.isLocked("universe")}
              onChange={(event) => ctx.update({ universe: Math.max(1, Number(event.target.value)) })}
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${ctx.isLocked("universe") ? "opacity-40 cursor-not-allowed" : ""}`}
            />
            <LockButton locked={ctx.isLocked("universe")} onToggle={() => ctx.toggleLock("universe")} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 flex-shrink-0">Channel</span>
            <input
              type="number" min={1} max={512}
              value={sharedChannel ?? ""}
              placeholder={sharedChannel === null ? "—" : ""}
              disabled={ctx.isLocked("startChannel")}
              onChange={(event) => ctx.update({ startChannel: Math.max(1, Number(event.target.value)) })}
              className={`w-20 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none placeholder:text-gray-600 ${ctx.isLocked("startChannel") ? "opacity-40 cursor-not-allowed" : ""}`}
            />
            <LockButton locked={ctx.isLocked("startChannel")} onToggle={() => ctx.toggleLock("startChannel")} />
          </div>
        </div>
      </>
    );
  },
};
