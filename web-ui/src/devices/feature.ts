/**
 * Core interfaces and utilities for the feature system.
 *
 * A feature bundles everything related to one device behaviour:
 *   defaultState  – initial SceneObject fields
 *   dmxChannels   – DMX channel layout declaration
 *   applyToModel  – per-frame GLTF mutations
 *   Inspector     – React inspector section
 *   headerWidget  – compact header control (e.g. power toggle)
 *
 * Add a new device type: compose features in registry.ts with bind().
 * Add a new feature: create a file in features/, export from index.ts.
 */

import type * as THREE from "three";
import type React from "react";

/** Degrees → radians conversion factor. Shared by pan, tilt, beam. */
export const DEG2RAD = Math.PI / 180;

// Defined here to break the circular import that would arise if feature.ts
// imported SceneObject from scene/types.ts (which imports from registry.ts).
// SceneObject in scene/types.ts satisfies FeatureObject structurally.

export interface FeatureObject {
  readonly id: string;
  readonly type: string;
  position: [number, number, number];
  lockedFields: string[];
  mode: string;
}

export function readField<T>(obj: FeatureObject, field: string, fallback: T): T {
  const value = (obj as unknown as Record<string, unknown>)[field];
  return value !== undefined ? (value as T) : fallback;
}

/**
 * Returns the named GLTF node from a model, caching the result in
 * model.userData on first call to avoid repeated tree traversals each frame.
 */
export function getCachedNode(
  model: THREE.Group,
  nodeName: string,
): THREE.Object3D | null {
  const key = `_node_${nodeName}`;
  if (model.userData[key] === undefined) {
    model.userData[key] = model.getObjectByName(nodeName) ?? null;
  }
  return model.userData[key] as THREE.Object3D | null;
}

/**
 * How a SceneObject field maps to one or more raw DMX bytes.
 *
 *   linear8  – 1 channel, field value 0-255 maps 1:1
 *   linear16 – 2 channels (coarse + fine), field value 0-65535
 *   rgbHex   – 3 channels (R, G, B), field value is a "#rrggbb" hex string
 *   step     – 1 channel, field value is a 0-based index into the steps array
 */
export type DmxEncoding =
  | { readonly kind: "linear8" }
  | { readonly kind: "linear16" }
  | { readonly kind: "rgbHex" }
  | {
      readonly kind: "step";
      readonly steps: ReadonlyArray<{
        readonly dmxValue: number;
        readonly label: string;
      }>;
    };

/** Number of consecutive DMX channels consumed by one encoding. */
export function encodingWidth(encoding: DmxEncoding): number {
  switch (encoding.kind) {
    case "linear16": return 2;
    case "rgbHex":   return 3;
    default:         return 1;
  }
}

export interface DmxChannelDef {
  /**
   * 0-based absolute channel within the fixture (= the 1-based `ch` value in
   * the registry config minus 1). Absolute from the fixture's startChannel.
   */
  readonly offset: number;
  readonly label: string;
  /** Name of the SceneObject field this channel reads for DMX output. */
  readonly field: string;
  readonly encoding: DmxEncoding;
}

export interface InspectorCtx {
  selected: FeatureObject[];
  shared: <V>(getter: (obj: FeatureObject) => V) => V | null;
  isMixed: <V>(getter: (obj: FeatureObject) => V) => boolean;
  avgInt: (getter: (obj: FeatureObject) => number) => number;
  avgFloat: (getter: (obj: FeatureObject) => number, decimals?: number) => number;
  update: (patch: Record<string, unknown>) => void;
  move: (movements: { id: string; position: [number, number, number] }[]) => void;
  isLocked: (field: string) => boolean;
  toggleLock: (field: string) => void;

  /**
   * Per-channel 1-based channel numbers. Present only in FixturePage context.
   * Keys: "dimmer", "ptSpeed", "pan:coarse", "pan:fine", etc.
   */
  channels?: Record<string, number>;
  onChannelChange?: (key: string, channel: number) => void;

  /** Per-feature config panel open state. Present only in FixturePage context. */
  configOpen?: Record<string, boolean>;
  onToggleConfig?: (featureType: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FeatureDef<TConfig = any> {
  /** Unique string identifier. Used by features that need to read sibling state. */
  readonly type: string;

  /** Returns SceneObject field defaults contributed by this feature. */
  defaultState(config: TConfig): Record<string, unknown>;

  /**
   * Declares the absolute DMX channel layout for this feature.
   * Channel numbers are read from the feature's own config (1-based `ch` field).
   * Omit entirely for features with no DMX output (name, transform, tilt, power…).
   */
  dmxChannels?(config: TConfig): ReadonlyArray<DmxChannelDef>;

  /**
   * Called every render frame to mutate GLTF model nodes (rotation, emissive…).
   * Runs inside useFrame — must be allocation-free on the hot path.
   * Use node.userData to persist initialisation data across calls.
   * boundFeatures gives access to sibling features (e.g. colour resolution).
   */
  applyToModel?(
    model: THREE.Group,
    obj: FeatureObject,
    config: TConfig,
    boundFeatures: ReadonlyArray<BoundFeature>,
  ): void;

  /** Inspector section rendered below the header in the ObjectInspector panel. */
  Inspector?: React.ComponentType<{ ctx: InspectorCtx; config: TConfig }>;

  /**
   * Compact widget rendered in the ObjectInspector header row.
   * Use for controls that belong next to the device title (e.g. a power toggle).
   */
  headerWidget?: React.ComponentType<{ ctx: InspectorCtx; config: TConfig }>;
}

// ─── Feature Categories ──────────────────────────────────────────────────────

export interface FeatureCategory {
  readonly key: string;
  readonly label: string;
  readonly features: readonly string[];
}

export const FEATURE_CATEGORIES: readonly FeatureCategory[] = [
  { key: "brightness", label: "Brightness", features: ["dimmer"] },
  { key: "color",      label: "Color",      features: ["colorWheel", "rgbColor", "dualWhite"] },
  { key: "panTilt",    label: "Pan / Tilt",  features: ["pan", "tilt", "ptSpeed"] },
  { key: "gobo",       label: "Gobo",        features: ["goboWheel"] },
  { key: "beam",       label: "Beam",        features: ["beam"] },
];

export interface BoundFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly feature: FeatureDef<any>;
  readonly config: unknown;
}

/** Type-safe factory: pairs a feature with its config. */
export function bind<TConfig>(
  feature: FeatureDef<TConfig>,
  config: TConfig,
): BoundFeature {
  return { feature, config };
}
