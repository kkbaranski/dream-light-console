export interface ColorPreset {
  label: string;
  dmx: number;
  color: string;
}

export interface GoboPreset {
  label: string;
  dmx: number;
  symbol: string;
}

export type Capability =
  | { type: "dimmer"; offset: number; label: string }
  | { type: "rgb"; offsetR: number; offsetG: number; offsetB: number }
  | { type: "pan"; offset: number; label: string }
  | { type: "tilt"; offset: number; label: string }
  | { type: "colorWheel"; offset: number; presets: ColorPreset[] }
  | { type: "gobo"; offset: number; presets: GoboPreset[] };

export interface FixtureDef {
  id: string;
  label: string;
  channelCount: number;
  badgeClass: string;
  capabilities: Capability[];
}

export interface CapabilityProps {
  capability: Capability;
  startChannel: number; // 1-indexed
  universe: number;
  channels: number[]; // 512-element, 0-indexed
  onChannelChange: (dmxChannel: number, value: number) => void; // dmxChannel 1-indexed
}

/** Type-safe helper to find a specific capability by type. */
export function findCapability<T extends Capability["type"]>(
  capabilities: Capability[],
  type: T,
): Extract<Capability, { type: T }> | undefined {
  return capabilities.find((c) => c.type === type) as
    | Extract<Capability, { type: T }>
    | undefined;
}
