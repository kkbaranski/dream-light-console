/**
 * Generic capability interfaces — pure data, no logic, no React, no Three.js.
 *
 * Each interface describes one reusable behaviour that any device can opt into
 * by including it in its DEVICE_REGISTRY entry.  The generic PlacedObject
 * renderer picks them up automatically — adding a new device type that uses
 * existing capabilities requires zero renderer changes.
 */

/** Horizontal rotation driven by a pan value (0–255). */
export interface PanCapDef {
  readonly nodeName: string;     // GLTF node to rotate
  readonly totalDegrees: number; // e.g. 540 = ±270°
}

/** Vertical rotation driven by a tilt value (0–255). */
export interface TiltCapDef {
  readonly nodeName: string;      // GLTF node to rotate around X
  readonly startDegrees: number;  // resting angle offset, e.g. 90
  readonly totalDegrees: number;  // total travel, e.g. 359
}

/**
 * Emitted spotlight beam with an optional volumetric cone mesh.
 * Expects the SceneObject to carry: dimmer (0–255), powered (boolean).
 *
 * Beam angle:
 *   coneAngle present → user-adjustable; SceneObject carries a `coneAngle` field.
 *   coneAngle absent  → fixed; angle is taken from fixedConeAngleDeg (default 15°).
 */
export interface BeamCapDef {
  readonly glowMaterialName: string; // material name of the lens aperture mesh
  readonly lensOffset: number;       // distance from origin node to lens (metres)
  readonly lensRadius: number;       // lens aperture radius (metres)
  /** Present when the user can adjust the beam spread. */
  readonly coneAngle?: {
    readonly min: number;
    readonly max: number;
    readonly default: number;
  };
  /** Fixed beam spread in degrees when coneAngle is absent. Defaults to 15. */
  readonly fixedConeAngleDeg?: number;
  // 0 = no visible cone mesh; 0–1 = max opacity at lens end (fades to transparent at far end).
  readonly coneOpacity?: number;
}

// ── Color capabilities ────────────────────────────────────────────────────────
// A device declares exactly one of these.  The renderer resolves all three to a
// single THREE.Color that drives the glow material, spotlight, and cone shader.

/**
 * Continuous RGB color mixing (color string stored on SceneObject as `color: string`).
 * Typical use: LED wash, moving head with CMY/RGB mixing.
 */
export interface RgbColorCapDef {
  readonly defaultColor: string; // hex, e.g. "#ffffff"
}

/**
 * Discrete color wheel with named, fixed-color positions.
 * SceneObject stores the selected slot index as `colorWheelIndex: number`.
 * Typical use: traditional moving heads, scanners.
 */
export interface ColorWheelCapDef {
  readonly colors: ReadonlyArray<{
    readonly name: string;
    readonly hex: string;
  }>;
  readonly defaultIndex: number;
}

/**
 * Two independent white-LED channels (warm and cold) mixed additively.
 * SceneObject stores `warmLevel: number` (0–255) and `coldLevel: number` (0–255).
 * The resulting beam colour is the additive blend of both channels.
 * Typical use: bi-colour LED panel, warm/cold white PAR.
 */
export interface DualWhiteCapDef {
  readonly warmColorHex: string; // visual representation of warm white, e.g. "#ffd27d" (≈3200 K)
  readonly coldColorHex: string; // visual representation of cold white, e.g. "#e8f4ff" (≈6500 K)
}

// ── Other capabilities ────────────────────────────────────────────────────────

/** Telescoping inner pole driven by a height value (0–1). */
export interface InnerPoleCapDef {
  readonly nodeName: string; // GLTF node whose Y position is extended
}
