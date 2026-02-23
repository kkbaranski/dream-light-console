import type { CapabilityProps } from "../types";
import { presetThreshold } from "./colorUtils";

export function Gobo({
  capability,
  startChannel,
  channels,
  onChannelChange,
}: CapabilityProps) {
  if (capability.type !== "gobo") return null;
  const dmxChannel = startChannel + capability.offset;
  const currentDmx = channels[dmxChannel - 1] ?? 0;
  const threshold = presetThreshold(capability.presets);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-gray-400 text-xs">Gobo</span>
      <div className="grid grid-cols-3 gap-1">
        {capability.presets.map((preset) => {
          const active = Math.abs(currentDmx - preset.dmx) < threshold;
          return (
            <button
              key={preset.label}
              onClick={() => onChannelChange(dmxChannel, preset.dmx)}
              className={`flex flex-col items-center py-1 px-1 rounded text-xs border transition-all ${
                active
                  ? "border-blue-400 bg-blue-900/40 text-blue-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
              }`}
            >
              <span className="text-base leading-none">{preset.symbol}</span>
              <span className="text-[10px] mt-0.5">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
