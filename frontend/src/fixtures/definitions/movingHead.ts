import type { FixtureDef } from "../types";

export const movingHeadDef: FixtureDef = {
  id: "moving_head",
  label: "Moving Head",
  channelCount: 5,
  badgeClass: "bg-blue-900 text-blue-300",
  capabilities: [
    { type: "pan", offset: 0, label: "Pan" },
    { type: "tilt", offset: 1, label: "Tilt" },
    { type: "dimmer", offset: 2, label: "Dimmer" },
    {
      type: "colorWheel",
      offset: 3,
      presets: [
        { label: "White", dmx: 0, color: "#ffffff" },
        { label: "Red", dmx: 32, color: "#ff2200" },
        { label: "Orange", dmx: 64, color: "#ff8000" },
        { label: "Yellow", dmx: 96, color: "#ffee00" },
        { label: "Green", dmx: 128, color: "#00dd00" },
        { label: "Blue", dmx: 160, color: "#0055ff" },
        { label: "Indigo", dmx: 192, color: "#4b0082" },
        { label: "UV", dmx: 224, color: "#a000ff" },
      ],
    },
    {
      type: "gobo",
      offset: 4,
      presets: [
        { label: "Open", dmx: 0, symbol: "○" },
        { label: "Dots", dmx: 36, symbol: "⠿" },
        { label: "Lines", dmx: 72, symbol: "≡" },
        { label: "Star", dmx: 108, symbol: "✦" },
        { label: "Flower", dmx: 144, symbol: "❀" },
        { label: "Burst", dmx: 200, symbol: "✳" },
      ],
    },
  ],
};
