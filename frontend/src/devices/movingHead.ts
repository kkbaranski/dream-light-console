import type { LightDeviceDef } from "./types";

export const MOVING_HEAD_DEF = {
  type: "moving_head",
  label: "Moving Head",
  modelPath: "/models/lights/moving_head.glb",
  targetHeight: 2,

  pan: {
    nodeNames: ["Yoke"],
    totalDegrees: 540,
  },

  tilt: {
    nodeNames: ["Head"],
    startDegrees: 90,
    totalDegrees: 359,
  },

  beam: {
    originNodeName: "Head",
    glowMaterialName: "Glow",
    lensOffset: 0.06,
    lensRadius: 0.08,
    maxLength: 150,
    coneAngle: { min: 1, max: 60, default: 15 },
  },

  fixture: {
    defaultChannels: 8,
  },
} satisfies LightDeviceDef;
