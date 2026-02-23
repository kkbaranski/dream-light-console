import type { CapabilityProps } from "../types";
import { Fader } from "./Fader";
import { rgbToHex, hexToRgb } from "./colorUtils";

export function RGBGroup({
  capability,
  startChannel,
  channels,
  onChannelChange,
}: CapabilityProps) {
  if (capability.type !== "rgb") return null;
  const rCh = startChannel + capability.offsetR;
  const gCh = startChannel + capability.offsetG;
  const bCh = startChannel + capability.offsetB;
  const r = channels[rCh - 1] ?? 0;
  const g = channels[gCh - 1] ?? 0;
  const b = channels[bCh - 1] ?? 0;

  function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { r: nr, g: ng, b: nb } = hexToRgb(e.target.value);
    onChannelChange(rCh, nr);
    onChannelChange(gCh, ng);
    onChannelChange(bCh, nb);
  }

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-gray-400 text-xs">Colour</span>
        <input
          type="color"
          value={rgbToHex(r, g, b)}
          onChange={handleColorChange}
          className="w-full h-8 rounded cursor-pointer border-0 bg-transparent"
        />
      </label>
      <Fader label="Red" value={r} onChange={(v) => onChannelChange(rCh, v)} />
      <Fader label="Green" value={g} onChange={(v) => onChannelChange(gCh, v)} />
      <Fader label="Blue" value={b} onChange={(v) => onChannelChange(bCh, v)} />
    </>
  );
}
