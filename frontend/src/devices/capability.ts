/**
 * Core interfaces and utilities for the capability system.
 *
 * A capability bundles everything related to one device behaviour:
 *   defaultState  – initial SceneObject fields
 *   dmxChannels   – DMX channel layout declaration
 *   applyToModel  – per-frame GLTF mutations
 *   Inspector     – React inspector section
 *   headerWidget  – compact header control (e.g. power toggle)
 *
 * Add a new device type: compose capabilities in registry.ts with bind().
 * Add a new capability: create a file in capabilities/, export from index.ts.
 */

import type * as THREE from "three";
import type React from "react";

// ── Placed-object shape ───────────────────────────────────────────────────────
// Defined here to break the circular import that would arise if capability.ts
// imported SceneObject from scene/types.ts (which imports from registry.ts).
// SceneObject in scene/types.ts satisfies CapObject structurally.

export interface CapObject {
  readonly id: string;
  readonly type: string;
  position: [number, number, number];
  lockedFields: string[];
  modeIndex: number;
}

export function readField<T>(obj: CapObject, field: string, fallback: T): T {
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

// ── DMX channel definitions ───────────────────────────────────────────────────

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
  /** 0-based offset from this capability's channelOffset in the fixture mode. */
  readonly offset: number;
  readonly label: string;
  /** Name of the SceneObject field this channel reads for DMX output. */
  readonly field: string;
  readonly encoding: DmxEncoding;
}

// ── Inspector context ─────────────────────────────────────────────────────────

export interface InspectorCtx {
  selected: CapObject[];
  shared: <V>(getter: (obj: CapObject) => V) => V | null;
  isMixed: <V>(getter: (obj: CapObject) => V) => boolean;
  avgInt: (getter: (obj: CapObject) => number) => number;
  avgFloat: (getter: (obj: CapObject) => number, decimals?: number) => number;
  update: (patch: Record<string, unknown>) => void;
  move: (movements: { id: string; position: [number, number, number] }[]) => void;
  isLocked: (field: string) => boolean;
  toggleLock: (field: string) => void;
}

// ── Capability definition ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CapabilityDef<TConfig = any> {
  /** Unique string identifier. Used by capabilities that need to read sibling state. */
  readonly type: string;

  /** Returns SceneObject field defaults contributed by this capability. */
  defaultState(config: TConfig): Record<string, unknown>;

  /**
   * Declares the DMX channel layout for this capability, relative to offset 0.
   * Omit entirely for capabilities with no DMX output (name, transform, power…).
   */
  dmxChannels?(config: TConfig): ReadonlyArray<DmxChannelDef>;

  /**
   * Called every render frame to mutate GLTF model nodes (rotation, emissive…).
   * Runs inside useFrame — must be allocation-free on the hot path.
   * Use node.userData to persist initialisation data across calls.
   * boundCaps gives access to sibling capabilities (e.g. colour resolution).
   */
  applyToModel?(
    model: THREE.Group,
    obj: CapObject,
    config: TConfig,
    boundCaps: ReadonlyArray<BoundCapability>,
  ): void;

  /** Inspector section rendered below the header in the ObjectInspector panel. */
  Inspector?: React.ComponentType<{ ctx: InspectorCtx; config: TConfig }>;

  /**
   * Compact widget rendered in the ObjectInspector header row.
   * Use for controls that belong next to the device title (e.g. a power toggle).
   */
  headerWidget?: React.ComponentType<{ ctx: InspectorCtx; config: TConfig }>;
}

// ── Bound capability ──────────────────────────────────────────────────────────

export interface BoundCapability {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly cap: CapabilityDef<any>;
  readonly config: unknown;
  /**
   * 0-based DMX channel offset from the fixture's startChannel.
   * Undefined when this capability produces no DMX output.
   */
  readonly channelOffset?: number;
}

/**
 * Type-safe factory: pairs a capability with its config and optional DMX offset.
 *
 * @param channelOffset - 0-based offset from startChannel; omit if no DMX output.
 */
export function bind<TConfig>(
  cap: CapabilityDef<TConfig>,
  config: TConfig,
  channelOffset?: number,
): BoundCapability {
  return { cap, config, channelOffset };
}

// ── Fixture mode ──────────────────────────────────────────────────────────────

export interface FixtureMode {
  readonly label: string;
  readonly capabilities: ReadonlyArray<BoundCapability>;
}
