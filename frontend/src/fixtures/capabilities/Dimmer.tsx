import type { CapabilityProps } from "../types";
import { Fader } from "./Fader";

export function Dimmer({
  capability,
  startChannel,
  channels,
  onChannelChange,
}: CapabilityProps) {
  if (capability.type !== "dimmer") return null;
  const dmxChannel = startChannel + capability.offset;
  const value = channels[dmxChannel - 1] ?? 0;
  return (
    <Fader
      label={capability.label}
      value={value}
      onChange={(v) => onChannelChange(dmxChannel, v)}
    />
  );
}
