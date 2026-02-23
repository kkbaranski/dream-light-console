import type { FixtureDef } from "../types";

export const genericDef: FixtureDef = {
  id: "generic",
  label: "Generic (intensity)",
  channelCount: 1,
  badgeClass: "bg-gray-700 text-gray-300",
  capabilities: [{ type: "dimmer", offset: 0, label: "Intensity" }],
};
