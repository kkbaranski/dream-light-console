/**
 * Central device registry — the single source of truth for all placeable objects.
 *
 * To add a new device type:
 *   1. Add an entry here, composing its capabilities with bind().
 *   2. Place the GLB at the corresponding public path.
 *
 * Everything else (renderer, inspector, store defaults, DMX footprint) is
 * derived automatically from the capabilities declared here.
 *
 * DMX channel offsets use 0-based numbering from startChannel.
 * Example: bind(dimmer, {}, 0) → startChannel+1 in 1-based DMX addressing.
 */

import { bind, type BoundCapability, type FixtureMode } from "./capability";
import {
  name, dmx, dimmer, power, transform,
  rgbColor, panTilt, tilt, innerPole, beam, dualWhite,
} from "./capabilities";
import { validateRegistry } from "./validation";

export interface DeviceDef {
  readonly label: string;
  readonly modelPath: string;
  readonly targetHeight: number;
  readonly supportsGroupDrag: boolean;
  readonly supportsAdditiveSelect: boolean;
  readonly supportsCopyPaste: boolean;
  readonly modes: ReadonlyArray<FixtureMode>;
  readonly defaultModeIndex: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a fixture mode — a named capability layout with optional DMX offsets. */
function mode(label: string, capabilities: ReadonlyArray<BoundCapability>): FixtureMode {
  return { label, capabilities };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const DEVICE_REGISTRY = {
  moving_head: {
    label:                  "Moving Head",
    modelPath:              "/models/lights/moving_head.glb",
    targetHeight:           1,
    supportsGroupDrag:      true,
    supportsAdditiveSelect: true,
    supportsCopyPaste:      true,
    defaultModeIndex: 0,
    modes: [
      mode("7 Channel", [
        bind(name,    { defaultName: "Moving Head" }),
        bind(dmx,     {}),
        bind(dimmer,  {}, 0),                     // CH1 — Dimmer
        bind(power,   {}),
        bind(panTilt, {
          panNodeName: "Yoke", panTotalDegrees: 540,
          tilt: { nodeName: "Head", startDegrees: 0, totalDegrees: 359 },
        }, 1),                                     // CH2 — Pan, CH3 — Tilt
        bind(rgbColor, { defaultColor: "#ffffff" }, 3), // CH4–6 — R, G, B
        bind(beam, {
          glowMaterialName: "Glow",
          lensOffset:  0.06,
          lensRadius:  0.08,
          coneAngle:   { min: 1, max: 60, default: 15 },
          coneOpacity: 0.35,
        }, 6),                                     // CH7 — Beam Angle
        bind(transform, {}),
      ]),
    ],
  },

  gobo: {
    label:                  "Gobo",
    modelPath:              "/models/lights/gobo.glb",
    targetHeight:           2,
    supportsGroupDrag:      true,
    supportsAdditiveSelect: true,
    supportsCopyPaste:      true,
    defaultModeIndex: 0,
    modes: [
      mode("7 Channel", [
        bind(name,    { defaultName: "Gobo" }),
        bind(dmx,     {}),
        bind(dimmer,  {}, 0),
        bind(power,   {}),
        bind(panTilt, {
          panNodeName: "Yoke", panTotalDegrees: 540,
          tilt: { nodeName: "Head", startDegrees: 0, totalDegrees: 359 },
        }, 1),
        bind(rgbColor, { defaultColor: "#ffffff" }, 3),
        bind(beam, {
          glowMaterialName: "Glow",
          lensOffset:  0.06,
          lensRadius:  0.08,
          coneAngle:   { min: 1, max: 60, default: 15 },
          coneOpacity: 0.35,
        }, 6),
        bind(transform, {}),
      ]),
    ],
  },

  fresnel: {
    label:                  "Fresnel",
    modelPath:              "/models/lights/fresnel.glb",
    targetHeight:           1,
    supportsGroupDrag:      true,
    supportsAdditiveSelect: true,
    supportsCopyPaste:      true,
    defaultModeIndex: 0,
    modes: [
      mode("4 Channel", [
        bind(name,    { defaultName: "Fresnel" }),
        bind(dmx,     {}),
        bind(dimmer,  {}, 0),                                      // CH1 — Dimmer
        bind(power,   {}),
        bind(dualWhite, { warmColorHex: "#fff6e8", coldColorHex: "#e9e8ff" }, 1), // CH2–3
        bind(tilt, {
          nodeName:     "Base",
          startDegrees: -60,
          totalDegrees: 270,
        }),                                                        // manual — no DMX
        bind(beam, {
          glowMaterialName: "Bulb",
          lensRadius:   0.12,
          lensPosition: [0, 0, -0.7],                            // Base pivot → lens face (-Z side)
          beamLocalDir: [0, 0, -1],                              // Fresnel fires in Base's local -Z
          coneAngle:    { min: 5, max: 70, default: 25 },
          coneOpacity:  0.3,
        }, 3),                                                     // CH4 — Beam Angle
        bind(transform, {}),
      ]),
    ],
  },

  speaker_1: {
    label: "Speaker 1", modelPath: "/models/speakers/speaker_1.glb",
    targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },

  speaker_2: {
    label: "Speaker 2", modelPath: "/models/speakers/speaker_2.glb",
    targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },

  tripod: {
    label: "Tripod", modelPath: "/models/stands/tripod.glb",
    targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [
      bind(innerPole, { nodeName: "InnerPole" }),
      bind(transform, {}),
    ])],
  },

  tripod_with_bar: {
    label: "Tripod w/ Bar", modelPath: "/models/stands/tripod_with_bar.glb",
    targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [
      bind(innerPole, { nodeName: "InnerPole" }),
      bind(transform, {}),
    ])],
  },

  mic: {
    label: "Microphone", modelPath: "/models/mic.glb",
    targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },

  barricade: {
    label: "Barricade", modelPath: "/models/barricade.glb",
    targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },

  disco_ball: {
    label: "Disco Ball", modelPath: "/models/other/disco_ball.glb",
    targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },

  disco_ball2: {
    label: "Disco Ball 2", modelPath: "/models/other/disco_ball2.glb",
    targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
    supportsCopyPaste: false, defaultModeIndex: 0,
    modes: [mode("Default", [bind(transform, {})])],
  },
} satisfies Record<string, DeviceDef>;

/** Derived from registry keys — never maintain this manually. */
export type SceneObjectType = keyof typeof DEVICE_REGISTRY;

/** Returns the active capability set for an object given its current mode index. */
export function activeCapabilities(
  def: DeviceDef,
  modeIndex: number,
): ReadonlyArray<BoundCapability> {
  return def.modes[modeIndex]?.capabilities ?? def.modes[0].capabilities;
}

/** Returns true when the device emits light in at least one of its modes. */
export function hasBeam(def: DeviceDef): boolean {
  return def.modes.some((fixtureMode) =>
    fixtureMode.capabilities.some((bound) => bound.cap.type === "beam"),
  );
}

// Validate channel layout at module load time (logs errors; does not throw).
validateRegistry(DEVICE_REGISTRY);
