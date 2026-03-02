/**
 * Central device registry — the single source of truth for all placeable objects.
 *
 * To add a new device type:
 *   1. Add an entry below. Capabilities are plain object fields — presence means
 *      the device has that capability. Absence means it doesn't.
 *   2. Place the GLB at the corresponding public path.
 *
 * DMX offsets are 0-based. Capabilities without a `dmx` field are manual-only (no DMX output).
 */

import type {BoundCapability, CapabilityDef} from "./capability";
import type {
    BeamConfig,
    ColorWheelConfig,
    DimmerConfig,
    DmxConfig,
    DualWhiteConfig,
    InnerPoleConfig,
    NameConfig,
    PanConfig,
    PowerConfig,
    RgbColorConfig,
    TiltConfig,
    TransformConfig,
}                                            from "./capabilities";
import {
    beam,
    colorWheel,
    dimmer,
    dmx,
    dualWhite,
    innerPole,
    name,
    pan,
    power,
    rgbColor,
    tilt,
    transform,
}                                            from "./capabilities";
import {
    validateMode
}                                            from "./validation";

// ── Fixture mode ──────────────────────────────────────────────────────────────
// Each optional field corresponds to a capability. Presence = device has it.

export interface FixtureMode {
    readonly label: string;
    readonly name?: NameConfig;
    readonly dmx?: DmxConfig;
    readonly power?: PowerConfig;
    readonly transform?: TransformConfig;
    readonly dimmer?: DimmerConfig;
    readonly pan?: PanConfig;
    readonly tilt?: TiltConfig;
    readonly rgbColor?: RgbColorConfig;
    readonly colorWheel?: ColorWheelConfig;
    readonly dualWhite?: DualWhiteConfig;
    readonly innerPole?: InnerPoleConfig;
    readonly beam?: BeamConfig;
}

export interface DeviceDef {
    readonly label: string;
    readonly modelPath: string;
    readonly targetHeight: number;
    readonly supportsGroupDrag: boolean;
    readonly supportsAdditiveSelect: boolean;
    readonly supportsCopyPaste: boolean;
    readonly modes: Readonly<Record<string, FixtureMode>>;
    readonly defaultMode: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const DEVICE_REGISTRY = {
    moving_head: {
        label: "Moving Head",
        modelPath: "/models/lights/moving_head.glb",
        targetHeight: 1,
        supportsGroupDrag: true,
        supportsAdditiveSelect: true,
        supportsCopyPaste: true,
        defaultMode: "sevenChannel",
        modes: {
            sevenChannel: {
                label: "7 Channel",
                name: {defaultName: "Moving Head"},
                dmx: {},
                power: {},
                transform: {},
                dimmer: {dmx: {offset: 0}},
                pan: {dmx: {offset: 1}, modelNode: "Yoke", totalDegrees: 540},
                tilt: {dmx: {offset: 2}, modelNode: "Head", startDegrees: 0, totalDegrees: 359},
                rgbColor: {dmx: {red: 3, green: 4, blue: 5}, defaultColor: "#ffffff"},
                beam: {dmx: {offset: 6}, glowMaterialName: "Glow", lensOffset: 0.06, lensRadius: 0.08, coneAngle: {min: 1, max: 60, default: 15}, coneOpacity: 0.35},
            },
        },
    },

    gobo: {
        label: "Gobo",
        modelPath: "/models/lights/gobo.glb",
        targetHeight: 2,
        supportsGroupDrag: true,
        supportsAdditiveSelect: true,
        supportsCopyPaste: true,
        defaultMode: "sevenChannel",
        modes: {
            sevenChannel: {
                label: "7 Channel",
                name: {defaultName: "Gobo"},
                dmx: {},
                power: {},
                transform: {},
                dimmer: {dmx: {offset: 0}},
                pan: {dmx: {offset: 1}, modelNode: "Yoke", totalDegrees: 540},
                tilt: {dmx: {offset: 2}, modelNode: "Head", startDegrees: 0, totalDegrees: 359},
                rgbColor: {dmx: {red: 3, green: 4, blue: 5}, defaultColor: "#ffffff"},
                beam: {dmx: {offset: 6}, glowMaterialName: "Glow", lensOffset: 0.06, lensRadius: 0.08, coneAngle: {min: 1, max: 60, default: 15}, coneOpacity: 0.35},
            },
        },
    },

    fresnel: {
        label: "Fresnel",
        modelPath: "/models/lights/fresnel.glb",
        targetHeight: 1,
        supportsGroupDrag: true,
        supportsAdditiveSelect: true,
        supportsCopyPaste: true,
        defaultMode: "fourChannel",
        modes: {
            fourChannel: {
                label: "4 Channel",
                name: {defaultName: "Fresnel"},
                dmx: {},
                power: {},
                transform: {},
                dimmer: {dmx: {offset: 0}},
                dualWhite: {dmx: {warm: 1, cold: 2}, warmColorHex: "#fff6e8", coldColorHex: "#e9e8ff"},
                tilt: {modelNode: "Base", startDegrees: -60, totalDegrees: 270},
                beam: {
                    dmx: {offset: 3}, glowMaterialName: "Bulb", lensRadius: 0.12, lensPosition: [
                        0,
                        0,
                        -0.7
                    ], beamLocalDir: [0, 0, -1], coneAngle: {min: 5, max: 70, default: 25}, coneOpacity: 0.3
                },
            },
        },
    },

    speaker_1: {
        label: "Speaker 1", modelPath: "/models/speakers/speaker_1.glb",
        targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },

    speaker_2: {
        label: "Speaker 2", modelPath: "/models/speakers/speaker_2.glb",
        targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },

    tripod: {
        label: "Tripod", modelPath: "/models/stands/tripod.glb",
        targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", innerPole: {modelNode: "InnerPole"}, transform: {}}},
    },

    tripod_with_bar: {
        label: "Tripod w/ Bar", modelPath: "/models/stands/tripod_with_bar.glb",
        targetHeight: 8.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", innerPole: {modelNode: "InnerPole"}, transform: {}}},
    },

    mic: {
        label: "Microphone", modelPath: "/models/mic.glb",
        targetHeight: 3.0, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },

    barricade: {
        label: "Barricade", modelPath: "/models/barricade.glb",
        targetHeight: 2.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },

    disco_ball: {
        label: "Disco Ball", modelPath: "/models/other/disco_ball.glb",
        targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },

    disco_ball2: {
        label: "Disco Ball 2", modelPath: "/models/other/disco_ball2.glb",
        targetHeight: 1.5, supportsGroupDrag: false, supportsAdditiveSelect: false,
        supportsCopyPaste: false, defaultMode: "default",
        modes: {default: {label: "Default", transform: {}}},
    },
} satisfies Record<string, DeviceDef>;

/** Derived from registry keys — never maintain this manually. */
export type SceneObjectType = keyof typeof DEVICE_REGISTRY;

// ── Capability resolution ──────────────────────────────────────────────────────
// Ordered list mapping FixtureMode keys → CapabilityDef objects.
// This order determines rendering order in the inspector.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CAPABILITY_MAP: ReadonlyArray<{ key: keyof Omit<FixtureMode, "label">; cap: CapabilityDef<any> }> = [
    {key: "name", cap: name},
    {key: "dmx", cap: dmx},
    {key: "power", cap: power},
    {key: "transform", cap: transform},
    {key: "dimmer", cap: dimmer},
    {key: "pan", cap: pan},
    {key: "tilt", cap: tilt},
    {key: "rgbColor", cap: rgbColor},
    {key: "colorWheel", cap: colorWheel},
    {key: "dualWhite", cap: dualWhite},
    {key: "innerPole", cap: innerPole},
    {key: "beam", cap: beam},
];

// WeakMap cache: each FixtureMode object gets its BoundCapability[] computed once,
// giving stable array references (important for React useMemo dependency checks).
const _capsCache = new WeakMap<object, ReadonlyArray<BoundCapability>>();

/** Returns the active capability set for an object given its current mode key. */
export function activeCapabilities(
    def: DeviceDef,
    modeKey: string,
): ReadonlyArray<BoundCapability> {
    const mode = def.modes[modeKey] ?? Object.values(def.modes)[0];
    const cached = _capsCache.get(mode as object);
    if (cached !== undefined) {
        return cached;
    }
    const caps: BoundCapability[] = CAPABILITY_MAP.flatMap(({key, cap}) => {
        const config = mode[key];
        return config !== undefined ? [{cap, config}] : [];
    });
    _capsCache.set(mode as object, caps);
    return caps;
}

/** Returns true when the device emits light in at least one of its modes. */
export function hasBeam(def: DeviceDef): boolean {
    return Object.values(def.modes).some((mode) => mode.beam !== undefined);
}

// Validate channel layout at module load time (logs errors; does not throw).
for (const def of Object.values(DEVICE_REGISTRY)) {
    for (const [modeKey, mode] of Object.entries(def.modes)) {
        validateMode(def.label, mode.label, activeCapabilities(def, modeKey));
    }
}
