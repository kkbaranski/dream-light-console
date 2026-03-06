import { readField, type FeatureDef } from "../../feature";
import { ChannelInput, LockButton, GearButton } from "../../../components/stage/inspectorPrimitives";
import { useStageEditorStore } from "../../../store/stageEditorStore";

export interface GoboWheelSlot {
  readonly name: string;
  readonly dmxStart: number;
  readonly dmxEnd: number;
  readonly hasIntensity?: boolean;
  readonly texturePath?: string;
}

export interface GoboWheelConfig {
  readonly dmx: { readonly offset: number };
  readonly gobos: ReadonlyArray<GoboWheelSlot>;
  readonly defaultIndex: number;
}

export const goboWheel: FeatureDef<GoboWheelConfig> = {
  type: "goboWheel",

  defaultState: (config) => ({
    goboWheel: config.gobos[Math.min(config.defaultIndex, config.gobos.length - 1)].dmxStart,
  }),

  dmxChannels: (config) => [
    {
      offset: config.dmx.offset,
      label: "Gobo Wheel",
      field: "goboWheel",
      encoding: { kind: "linear8" },
    },
  ],

  Inspector: ({ ctx, config }) => {
    const raw = readField<number>(ctx.selected[0], "goboWheel", config.gobos[config.defaultIndex].dmxStart);
    const selectedIndex = config.gobos.findIndex(g => raw >= g.dmxStart && raw <= g.dmxEnd);
    const selectedGobo = selectedIndex >= 0 ? config.gobos[selectedIndex] : null;
    const intensity = selectedGobo ? raw - selectedGobo.dmxStart : 0;
    const maxIntensity = selectedGobo ? selectedGobo.dmxEnd - selectedGobo.dmxStart : 0;
    const ch = ctx.channels?.["goboWheel"];
    const locked = ctx.isLocked("goboWheel");

    return (
      <>
        <div className="flex items-center gap-1.5 mb-1.5">
          {ch != null && (
            <ChannelInput
              channel={ch}
              onChange={ctx.onChannelChange && ((c) => ctx.onChannelChange!("goboWheel", c))}
            />
          )}
          <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
            Gobo Wheel
          </span>
          {ctx.onToggleConfig && (
            <GearButton open={ctx.configOpen?.goboWheel} onClick={() => ctx.onToggleConfig!("goboWheel")} />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {config.gobos.map((slot, i) => (
            <button
              key={slot.name}
              title={slot.name}
              disabled={locked}
              onClick={() => ctx.update({ goboWheel: slot.dmxStart })}
              className={`w-10 h-10 rounded border-2 transition-colors flex items-center justify-center overflow-hidden bg-gray-700 ${
                i === selectedIndex ? "border-white" : "border-transparent"
              } ${locked ? "opacity-40" : ""}`}
            >
              {slot.texturePath ? (
                <img src={slot.texturePath} alt={slot.name} className="w-full h-full object-contain" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-full h-full text-gray-600" fill="none" stroke="currentColor" strokeWidth={1}>
                  <line x1="0" y1="0" x2="24" y2="24" />
                  <line x1="24" y1="0" x2="0" y2="24" />
                </svg>
              )}
            </button>
          ))}
          <LockButton locked={locked} onToggle={() => ctx.toggleLock("goboWheel")} />
        </div>
        {selectedGobo?.hasIntensity && maxIntensity > 0 && (
          <div className={`flex flex-col gap-0.5 mt-1.5 ${locked ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="flex justify-between items-center px-0.5">
              <span className="text-xs text-gray-500">Intensity</span>
              <span className="text-xs font-mono text-gray-400">
                {intensity} ({(intensity / maxIntensity * 100).toFixed(1)}%)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={maxIntensity}
              step={1}
              value={intensity}
              disabled={locked}
              onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
              onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
              onChange={(e) => ctx.update({ goboWheel: selectedGobo.dmxStart + Number(e.target.value) })}
              className={`w-full accent-blue-500 ${locked ? "cursor-not-allowed" : ""}`}
            />
          </div>
        )}
      </>
    );
  },
};
