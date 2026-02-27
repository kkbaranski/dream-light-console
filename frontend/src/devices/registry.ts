/**
 * Central device registry — the single source of truth for all placeable objects.
 *
 * To add a new device type:
 *   1. Add an entry here (model path, capabilities, defaults).
 *   2. Place the GLB in the corresponding public path.
 *
 * That is all. The renderer (PlacedObject.tsx) and inspector (objectTypeDefs.tsx)
 * are driven entirely by this registry — no other file needs to change.
 */
import type {
  PanCapDef,
  TiltCapDef,
  BeamCapDef,
  RgbColorCapDef,
  ColorWheelCapDef,
  DualWhiteCapDef,
  InnerPoleCapDef,
} from "./capabilities";

export interface DeviceDef {
  readonly label: string;
  readonly modelPath: string;
  readonly targetHeight: number;        // metres — normalises model scale
  readonly supportsGroupDrag: boolean;
  readonly supportsAdditiveSelect: boolean;
  readonly supportsCopyPaste: boolean;
  /** Default capability field values for new instances of this device. */
  readonly defaults: Record<string, unknown>;
  readonly pan?: PanCapDef;
  readonly tilt?: TiltCapDef;
  readonly beam?: BeamCapDef;
  // Declare exactly one color capability when the device emits colored light.
  readonly rgbColor?: RgbColorCapDef;
  readonly colorWheel?: ColorWheelCapDef;
  readonly dualWhite?: DualWhiteCapDef;
  readonly innerPole?: InnerPoleCapDef;
}

export const DEVICE_REGISTRY = {
  moving_head: {
    label:                  "Moving Head",
    modelPath:              "/models/lights/moving_head.glb",
    targetHeight:           1,
    supportsGroupDrag:      true,
    supportsAdditiveSelect: true,
    supportsCopyPaste:      true,
    defaults: {
      name: "Moving Head", universe: 1, startChannel: 1,
      dimmer: 255, pan: 128, tilt: 0, color: "#ffffff", coneAngle: 15,
      powered: false, rotationX: 0, rotationY: 0, rotationZ: 0,
    },
    pan:      { nodeName: "Yoke", totalDegrees: 540 },
    tilt:     { nodeName: "Head", startDegrees: 0, totalDegrees: 359 },
    rgbColor: { defaultColor: "#ffffff" },
    beam: {
      glowMaterialName: "Glow", lensOffset: 0.06, lensRadius: 0.08,
      coneAngle: { min: 1, max: 60, default: 15 }, coneOpacity: 0.35,
    },
  },

  gobo: {
    label:                  "Gobo",
    modelPath:              "/models/lights/gobo.glb",
    targetHeight:           2,
    supportsGroupDrag:      true,
    supportsAdditiveSelect: true,
    supportsCopyPaste:      true,
    defaults: {
      name: "Gobo", universe: 1, startChannel: 1,
      dimmer: 255, pan: 128, tilt: 0, color: "#ffffff", coneAngle: 15,
      powered: false, rotationX: 0, rotationY: 0, rotationZ: 0,
    },
    pan:      { nodeName: "Yoke", totalDegrees: 540 },
    tilt:     { nodeName: "Head", startDegrees: 0, totalDegrees: 359 },
    rgbColor: { defaultColor: "#ffffff" },
    beam: {
      glowMaterialName: "Glow", lensOffset: 0.06, lensRadius: 0.08,
      coneAngle: { min: 1, max: 60, default: 15 }, coneOpacity: 0.85,
    },
  },

  speaker_1: {
    label: "Speaker 1", modelPath: "/models/speakers/speaker_1.glb",
    targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },

  speaker_2: {
    label: "Speaker 2", modelPath: "/models/speakers/speaker_2.glb",
    targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },

  tripod: {
    label: "Tripod", modelPath: "/models/stands/tripod.glb",
    targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { height: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
    innerPole: { nodeName: "InnerPole" },
  },

  tripod_with_bar: {
    label: "Tripod w/ Bar", modelPath: "/models/stands/tripod_with_bar.glb",
    targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { height: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
    innerPole: { nodeName: "InnerPole" },
  },

  mic: {
    label: "Microphone", modelPath: "/models/mic.glb",
    targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },

  barricade: {
    label: "Barricade", modelPath: "/models/barricade.glb",
    targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },

  disco_ball: {
    label: "Disco Ball", modelPath: "/models/other/disco_ball.glb",
    targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },

  disco_ball2: {
    label: "Disco Ball 2", modelPath: "/models/other/disco_ball2.glb",
    targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false,
    defaults: { rotationX: 0, rotationY: 0, rotationZ: 0 },
  },
} satisfies Record<string, DeviceDef>;

/** Derived from registry keys — never maintain this manually. */
export type SceneObjectType = keyof typeof DEVICE_REGISTRY;
