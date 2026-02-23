import type { CapabilityProps } from "../types";
import { presetThreshold } from "./colorUtils";

export function ColorWheel({
  capability,
  startChannel,
  channels,
  onChannelChange,
}: CapabilityProps) {
  if (capability.type !== "colorWheel") return null;
  const dmxChannel = startChannel + capability.offset;
  const currentDmx = channels[dmxChannel - 1] ?? 0;
  const threshold = presetThreshold(capability.presets);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-gray-400 text-xs">Colour wheel</span>
      <div className="grid grid-cols-4 gap-1">
        {capability.presets.map((preset) => {
          const active = Math.abs(currentDmx - preset.dmx) < threshold;
          return (
            <button
              key={preset.label}
              title={preset.label}
              onClick={() => onChannelChange(dmxChannel, preset.dmx)}
              className={`h-7 rounded text-xs font-bold transition-all border ${
                active
                  ? "border-white scale-105"
                  : "border-transparent hover:border-gray-500"
              }`}
              style={{ backgroundColor: preset.color, color: "#000" }}
            >
              {preset.label.charAt(0)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
