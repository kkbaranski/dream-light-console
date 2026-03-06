/**
 * Central device registry — the single source of truth for all placeable objects.
 *
 * To add a new device type:
 *   1. Add an entry below. Features are plain object fields — presence means
 *      the device has that feature. Absence means it doesn't.
 *   2. Place the GLB at the corresponding public path.
 *
 * DMX offsets are 0-based. Features without a `dmx` field are manual-only (no DMX output).
 */

import type {BoundFeature, FeatureDef} from "./feature";
import type {
    BeamConfig,
    ColorWheelConfig,
    DimmerConfig,
    DmxConfig,
    DualWhiteConfig,
    GoboWheelConfig,
    InnerPoleConfig,
    NameConfig,
    PanConfig,
    PtSpeedConfig,
    RgbColorConfig,
    TiltConfig,
    TransformConfig,
}                                            from "./features";
import {
    beam,
    colorWheel,
    dimmer,
    dmx,
    dualWhite,
    goboWheel,
    innerPole,
    name,
    pan,
    ptSpeed,
    rgbColor,
    tilt,
    transform,
}                                            from "./features";
import {
    validateMode
}                                            from "./validation";

// Each optional field corresponds to a feature. Presence = device has it.

export interface FixtureMode {
    readonly label: string;
    readonly name?: NameConfig;
    readonly dmx?: DmxConfig;
    readonly transform?: TransformConfig;
    readonly dimmer?: DimmerConfig;
    readonly pan?: PanConfig;
    readonly tilt?: TiltConfig;
    readonly rgbColor?: RgbColorConfig;
    readonly colorWheel?: ColorWheelConfig;
    readonly dualWhite?: DualWhiteConfig;
    readonly ptSpeed?: PtSpeedConfig;
    readonly goboWheel?: GoboWheelConfig;
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

export const DEVICE_REGISTRY = {
    moving_head: {
        label: "Moving Head",
        modelPath: "/models/lights/moving_head.glb",
        targetHeight: 1,
        supportsGroupDrag: true,
        supportsAdditiveSelect: true,
        supportsCopyPaste: true,
        defaultMode: "twelveChannel",
        modes: {
            twelveChannel: {
                label: "12 Channel",
                name: {defaultName: "Moving Head"},
                dmx: {},
                transform: {},
                pan: {dmx: {coarse: 0, fine: 1}, modelNode: "Yoke", totalDegrees: 540},
                tilt: {dmx: {coarse: 2, fine: 3}, modelNode: "Head", startDegrees: 0, totalDegrees: 360},
                ptSpeed: {dmx: {offset: 4}},
                dimmer: {dmx: {offset: 5}},
                // offset 6: strobe (not implemented yet)
                colorWheel: {
                    dmx: {offset: 7},
                    colors: [
                        {name: "White", hex: "#ffffff", dmxStart: 0, dmxEnd: 19},
                        {name: "Red", hex: "#ff0000", dmxStart: 20, dmxEnd: 39},
                        {name: "Orange", hex: "#ff8000", dmxStart: 40, dmxEnd: 59},
                        {name: "Yellow", hex: "#ffff00", dmxStart: 60, dmxEnd: 79},
                        {name: "Green", hex: "#00ff00", dmxStart: 80, dmxEnd: 99},
                        {name: "Blue", hex: "#0000ff", dmxStart: 100, dmxEnd: 119},
                        {name: "Pink", hex: "#ff69b4", dmxStart: 120, dmxEnd: 139},
                        {name: "Sea", hex: "#00cba9", dmxStart: 140, dmxEnd: 159},
                    ],
                    defaultIndex: 0,
                },
                goboWheel: {
                    dmx: {offset: 8},
                    gobos: [
                        {name: "None", dmxStart: 0, dmxEnd: 9},
                        {name: "Gobo 1", dmxStart: 10, dmxEnd: 19},
                        {name: "Gobo 2", dmxStart: 20, dmxEnd: 29},
                        {name: "Gobo 3", dmxStart: 30, dmxEnd: 39},
                        {name: "Gobo 4", dmxStart: 40, dmxEnd: 49},
                        {name: "Gobo 5", dmxStart: 50, dmxEnd: 59},
                        {name: "Gobo 6", dmxStart: 60, dmxEnd: 69},
                        {name: "Gobo 7", dmxStart: 70, dmxEnd: 79},
                    ],
                    defaultIndex: 0,
                },
                // offset 9: prism (not implemented yet)
                // offset 10: empty
                // offset 11: reset (not implemented yet)
                beam: {glowMaterialName: "Lens", lensPosition: [0, -0.24, 0.38], beamLocalDir: [0, -0.56, 0.83], lensRadius: 0.06, fixedConeAngleDeg: 12, coneOpacity: 0.35},
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
                transform: {},
                dimmer: {dmx: {offset: 0}},
                pan: {dmx: {offset: 1}, modelNode: "Yoke", totalDegrees: 540},
                tilt: {dmx: {offset: 2}, modelNode: "Head", startDegrees: 0, totalDegrees: 359},
                rgbColor: {dmx: {red: 3, green: 4, blue: 5}, defaultColor: "#000000"},
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FEATURE_MAP: ReadonlyArray<{ key: keyof Omit<FixtureMode, "label">; feature: FeatureDef<any> }> = [
    {key: "name", feature: name},
    {key: "dmx", feature: dmx},
    {key: "transform", feature: transform},
    {key: "dimmer", feature: dimmer},
    {key: "pan", feature: pan},
    {key: "tilt", feature: tilt},
    {key: "rgbColor", feature: rgbColor},
    {key: "colorWheel", feature: colorWheel},
    {key: "dualWhite", feature: dualWhite},
    {key: "ptSpeed", feature: ptSpeed},
    {key: "goboWheel", feature: goboWheel},
    {key: "innerPole", feature: innerPole},
    {key: "beam", feature: beam},
];

// WeakMap cache: each FixtureMode object gets its BoundFeature[] computed once,
// giving stable array references (important for React useMemo dependency checks).
const _featuresCache = new WeakMap<object, ReadonlyArray<BoundFeature>>();

/** Returns the active feature set for an object given its current mode key. */
export function activeFeatures(
    def: DeviceDef,
    modeKey: string,
): ReadonlyArray<BoundFeature> {
    const mode = def.modes[modeKey] ?? Object.values(def.modes)[0];
    const cached = _featuresCache.get(mode as object);
    if (cached !== undefined) {
        return cached;
    }
    const features: BoundFeature[] = FEATURE_MAP.flatMap(({key, feature}) => {
        const config = mode[key];
        return config !== undefined ? [{feature, config}] : [];
    });
    _featuresCache.set(mode as object, features);
    return features;
}

/** Returns true when the device emits light in at least one of its modes. */
export function hasBeam(def: DeviceDef): boolean {
    return Object.values(def.modes).some((mode) => mode.beam !== undefined);
}

// Validate channel layout at module load time (logs errors; does not throw).
for (const def of Object.values(DEVICE_REGISTRY)) {
    for (const [modeKey, mode] of Object.entries(def.modes)) {
        validateMode(def.label, mode.label, activeFeatures(def, modeKey));
    }
}
