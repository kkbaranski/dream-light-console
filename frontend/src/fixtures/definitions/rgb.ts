import type { FixtureDef } from "../types";

export const rgbDef: FixtureDef = {
  id: "rgb",
  label: "RGB",
  channelCount: 3,
  badgeClass: "bg-purple-900 text-purple-300",
  capabilities: [{ type: "rgb", offsetR: 0, offsetG: 1, offsetB: 2 }],
};
