import { useState, useRef, useEffect } from "react";
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

function NoGoboIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

function GoboThumbnail({ slot, selected, disabled, onClick }: {
  slot: GoboWheelSlot;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={slot.name}
      disabled={disabled}
      onClick={onClick}
      className={`w-10 h-10 rounded-lg border-2 transition-colors flex items-center justify-center overflow-hidden bg-gray-700 ${
        selected ? "border-blue-500" : "border-transparent hover:border-gray-500"
      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {slot.texturePath ? (
        <img src={slot.texturePath} alt={slot.name} className="w-full h-full object-contain" />
      ) : (
        <NoGoboIcon />
      )}
    </button>
  );
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
    const [open, setOpen] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    const raw = readField<number>(ctx.selected[0], "goboWheel", config.gobos[config.defaultIndex].dmxStart);
    const selectedIndex = config.gobos.findIndex(g => raw >= g.dmxStart && raw <= g.dmxEnd);
    const selectedGobo = selectedIndex >= 0 ? config.gobos[selectedIndex] : null;
    const intensity = selectedGobo ? raw - selectedGobo.dmxStart : 0;
    const maxIntensity = selectedGobo ? selectedGobo.dmxEnd - selectedGobo.dmxStart : 0;
    const ch = ctx.channels?.["goboWheel"];
    const locked = ctx.isLocked("goboWheel");

    useEffect(() => {
      if (!open) return;
      function handleMouseDown(e: MouseEvent) {
        if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

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

        <div className="relative">
          <div className="flex items-center gap-2">
            <button
              disabled={locked}
              onClick={() => setOpen(!open)}
              className={`w-10 h-10 rounded-lg border-2 transition-colors flex items-center justify-center overflow-hidden bg-gray-800 ${
                locked ? "opacity-40 pointer-events-none" : "hover:border-gray-500"
              } ${open ? "border-blue-500" : "border-gray-600"}`}
            >
              {selectedGobo?.texturePath ? (
                <img src={selectedGobo.texturePath} alt={selectedGobo.name} className="w-full h-full object-contain" />
              ) : (
                <NoGoboIcon />
              )}
            </button>
            <span className="text-xs text-gray-400">{selectedGobo?.name ?? "None"}</span>
            <LockButton locked={locked} onToggle={() => ctx.toggleLock("goboWheel")} />
          </div>

          {open && !locked && (
            <div
              ref={popupRef}
              className="absolute left-0 bottom-full mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-2"
            >
              <div className="grid grid-cols-4 gap-1.5">
                {config.gobos.map((slot, i) => (
                  <GoboThumbnail
                    key={slot.name}
                    slot={slot}
                    selected={i === selectedIndex}
                    disabled={locked}
                    onClick={() => { ctx.update({ goboWheel: slot.dmxStart }); setOpen(false); }}
                  />
                ))}
              </div>
            </div>
          )}
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
