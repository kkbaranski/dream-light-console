/**
 * Beam feature — everything related to emitting light from a fixture:
 *   applyToModel   – drives the lens glow material (colour + intensity)
 *   BeamRenderer   – sibling R3F component: spotlight + volumetric cone
 *   Inspector      – beam-angle slider (when the angle is user-adjustable)
 *
 * Colour resolution reads from whichever colour feature is also declared
 * on the device (rgbColor, colorWheel, or dualWhite), accessed via boundFeatures.
 */

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getCachedNode, readField, DEG2RAD, type FeatureDef, type FeatureObject, type BoundFeature } from "../../feature";
import { ValueSlider } from "../../../components/stage/inspectorPrimitives";
import { WALL_Z } from "../../../components/stage/sceneConstants";
import type { RgbColorConfig } from "../color/rgbColor";
import type { ColorWheelConfig } from "../color/colorWheel";
import type { DualWhiteConfig } from "../color/dualWhite";
import type { PanConfig } from "../panTilt/pan";
import type { TiltConfig } from "../panTilt/tilt";

// ── Colour resolution ─────────────────────────────────────────────────────────
// Resolves the active beam colour from whichever colour feature is bound.
// Temporary Color objects are module-level to avoid allocation on the hot path.

const temporaryWarmColor = new THREE.Color();
const temporaryColdColor = new THREE.Color();

export function resolveBeamColor(
  obj: FeatureObject,
  boundFeatures: ReadonlyArray<BoundFeature>,
): string {
  for (const { feature, config } of boundFeatures) {
    if (feature.type === "rgbColor") {
      const cfg = config as RgbColorConfig;
      return readField<string>(obj, "color", cfg.defaultColor);
    }

    if (feature.type === "colorWheel") {
      const cfg = config as ColorWheelConfig;
      const index = Math.min(
        readField<number>(obj, "colorWheelIndex", cfg.defaultIndex),
        cfg.colors.length - 1,
      );
      return cfg.colors[Math.max(0, index)].hex;
    }

    if (feature.type === "dualWhite") {
      const cfg = config as DualWhiteConfig;
      const warmNormalized = readField<number>(obj, "warmLevel", 0) / 255;
      const coldNormalized = readField<number>(obj, "coldLevel", 0) / 255;
      temporaryWarmColor.set(cfg.warmColorHex).multiplyScalar(warmNormalized);
      temporaryColdColor.set(cfg.coldColorHex).multiplyScalar(coldNormalized);
      temporaryWarmColor.add(temporaryColdColor);
      temporaryWarmColor.r = Math.min(1, temporaryWarmColor.r);
      temporaryWarmColor.g = Math.min(1, temporaryWarmColor.g);
      temporaryWarmColor.b = Math.min(1, temporaryWarmColor.b);
      return "#" + temporaryWarmColor.getHexString();
    }
  }

  return "#ffffff";
}

// ── Beam feature definition ───────────────────────────────────────────────────

export interface BeamConfig {
  readonly glowMaterialName: string;
  /**
   * Small scalar offset along the origin node's local -Y axis from the node centre
   * to the lens face. Used when the origin node sits at or near the lens.
   * Ignored when lensPosition is provided.
   */
  readonly lensOffset?: number;
  /**
   * Explicit 3-D position of the lens face in the origin node's local coordinate
   * space. Use this instead of lensOffset when the origin node's pivot is far from
   * the lens (e.g. a body-centre node on a fresnel where the lens is in +Z).
   */
  readonly lensPosition?: readonly [number, number, number];
  readonly lensRadius: number;
  /** Present when the user can adjust the beam spread; stored as `coneAngle` (degrees). */
  readonly coneAngle?: { readonly min: number; readonly max: number; readonly default: number };
  /** DMX wiring for beam angle. Required when coneAngle is present; omit for fixed-angle fixtures. */
  readonly dmx?: { readonly offset: number };
  /** Fixed spread in degrees when coneAngle is absent. */
  readonly fixedConeAngleDeg?: number;
  /** Max cone opacity (0–1) at the lens end. Set to 0 or omit to disable the cone mesh. */
  readonly coneOpacity?: number;
  /**
   * Direction the beam fires, in the BeamRenderer group's local space (= origin node's
   * world-space orientation, scale excluded).
   * Default [0, -1, 0] — correct for moving heads where the tilt node's -Y faces the lens.
   * Use [0, 0, -1] for fixtures whose lens faces the node's local -Z axis (e.g. Fresnel).
   */
  readonly beamLocalDir?: readonly [number, number, number];
}

export const beam: FeatureDef<BeamConfig> = {
  type: "beam",

  defaultState: (config) => ({
    ...(config.coneAngle ? { coneAngle: config.coneAngle.default } : {}),
  }),

  dmxChannels: (config) =>
    config.coneAngle && config.dmx !== undefined
      ? [{ offset: config.dmx.offset, label: "Beam Angle", field: "coneAngle", encoding: { kind: "linear8" } }]
      : [],

  applyToModel: (model, obj, config, boundFeatures) => {
    const node = getCachedNode(model, config.glowMaterialName);
    if (!node) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (mat.emissiveMap) { mat.emissiveMap = null; mat.needsUpdate = true; }

    const dimmer = readField<number>(obj, "dimmer", 0);
    mat.emissive.set(resolveBeamColor(obj, boundFeatures));
    mat.emissiveIntensity = (dimmer / 255) * 4;
  },

  Inspector: ({ ctx, config }) => {
    const { coneAngle } = config;
    if (!coneAngle) return null;
    const read = (obj: FeatureObject) => readField<number>(obj, "coneAngle", coneAngle.default);
    return (
      <ValueSlider
        label="Angle"
        value={ctx.shared(read) ?? ctx.avgInt(read)}
        isMixed={ctx.isMixed(read)}
        min={coneAngle.min}
        max={coneAngle.max}
        unit="°"
        locked={ctx.isLocked("coneAngle")}
        onToggleLock={() => ctx.toggleLock("coneAngle")}
        onChange={(v) => ctx.update({ coneAngle: v })}
      />
    );
  },
};

// ── BeamRenderer ──────────────────────────────────────────────────────────────
//
// Rendered as a sibling of the fixture body group in PlacedObject.
// The spotlight group tracks the beam-origin node in world space each frame.
//
// Technique: inner face (BackSide) of an open cone frustum with a ShaderMaterial
// computing axial + angular falloff — from threex.volumetricspotlight (J. Etienne).

const BEAM_VERTEX_SHADER = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal        = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = /* glsl */`
  varying vec3  vNormal;
  varying vec3  vWorldPosition;

  uniform vec3  spotPosition;
  uniform vec3  lightColor;
  uniform float attenuation;
  uniform float anglePower;
  uniform float opacity;

  void main() {
    float axialFade = 1.0 - clamp(
      distance(vWorldPosition, spotPosition) / attenuation,
      0.0, 1.0
    );
    vec3  normal      = vec3(vNormal.x, vNormal.y, abs(vNormal.z));
    float angularFade = pow(dot(normal, vec3(0.0, 0.0, 1.0)), anglePower);
    float intensity   = axialFade * angularFade * opacity;
    gl_FragColor      = vec4(lightColor, intensity);
  }
`;

const CONE_LENGTH         = 20;
const CONE_RADIAL_SEGMENTS = 128;
const CONE_ANGLE_POWER     = 2.0;

const BEAM_CLIP_PLANES = [
  new THREE.Plane(new THREE.Vector3(0, 1, 0),  0.1),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z + 0.1),
];

export interface BeamRendererProps {
  obj: FeatureObject;
  config: BeamConfig;
  /** The beam-origin node (tiltNode ?? panNode) from the fixture model. */
  originNode: THREE.Object3D | null;
  /** All bound features of this device — needed for colour resolution. */
  boundFeatures: ReadonlyArray<BoundFeature>;
}

export function BeamRenderer({ obj, config, originNode, boundFeatures }: BeamRendererProps) {
  const spotGroupRef = useRef<THREE.Group>(null);
  const spotRef      = useRef<THREE.SpotLight>(null);
  const coneMatRef   = useRef<THREE.ShaderMaterial>(null);

  const coneAngleDeg = config.coneAngle
    ? readField<number>(obj, "coneAngle", config.coneAngle.default)
    : (config.fixedConeAngleDeg ?? 15);
  const coneAngleRad = coneAngleDeg * DEG2RAD;

  const coneGeometry = useMemo(() => {
    const farRadius = config.lensRadius + CONE_LENGTH * Math.tan(coneAngleRad);
    const geometry = new THREE.CylinderGeometry(
      config.lensRadius,
      farRadius,
      CONE_LENGTH,
      CONE_RADIAL_SEGMENTS,
      1,
      true,
    );
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -CONE_LENGTH / 2, 0));
    return geometry;
  }, [coneAngleRad, config.lensRadius]);

  useEffect(() => () => { coneGeometry.dispose(); }, [coneGeometry]);

  const coneUniforms = useMemo(() => ({
    spotPosition: { value: new THREE.Vector3() },
    lightColor:   { value: new THREE.Color("#ffffff") },
    attenuation:  { value: CONE_LENGTH },
    anglePower:   { value: CONE_ANGLE_POWER },
    opacity:      { value: 0.0 },
  }), []);

  const [beamDirX, beamDirY, beamDirZ] = config.beamLocalDir ?? [0, -1, 0];

  const coneRotation = useMemo((): [number, number, number] => {
    if (beamDirX === 0 && beamDirY === -1 && beamDirZ === 0) return [0, 0, 0];
    const from = new THREE.Vector3(0, -1, 0);
    const to   = new THREE.Vector3(beamDirX, beamDirY, beamDirZ).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(from, to);
    const euler      = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z];
  }, [beamDirX, beamDirY, beamDirZ]);

  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;
    spot.target.position.set(beamDirX, beamDirY, beamDirZ);
    spot.add(spot.target);
    return () => { spot.remove(spot.target); };
  }, [beamDirX, beamDirY, beamDirZ]);

  const spotlightLocalPos = config.lensPosition ?? ([0, -(config.lensOffset ?? 0), 0] as const);

  useFrame(() => {
    if (!originNode || !spotGroupRef.current) return;
    originNode.getWorldPosition(spotGroupRef.current.position);
    originNode.getWorldQuaternion(spotGroupRef.current.quaternion);

    if (!coneMatRef.current || !spotRef.current) return;
    spotRef.current.getWorldPosition(
      coneMatRef.current.uniforms.spotPosition.value as THREE.Vector3,
    );
    (coneMatRef.current.uniforms.lightColor.value as THREE.Color).set(
      resolveBeamColor(obj, boundFeatures),
    );

    const dimmer  = readField<number>(obj, "dimmer", 0);
    coneMatRef.current.uniforms.opacity.value =
      config.coneOpacity
        ? config.coneOpacity * (dimmer / 255)
        : 0;
  });

  const dimmerNormalized = readField<number>(obj, "dimmer", 0) / 255;
  const beamColor        = resolveBeamColor(obj, boundFeatures);

  return (
    <group ref={spotGroupRef}>
      <spotLight
        ref={spotRef}
        position={spotlightLocalPos}
        color={beamColor}
        intensity={dimmerNormalized * 100}
        angle={coneAngleRad}
        penumbra={0.2}
        distance={150}
        decay={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.001}
      />

      {config.coneOpacity && config.coneOpacity > 0 && (
        <mesh geometry={coneGeometry} position={spotlightLocalPos} rotation={coneRotation} userData={{ isBeam: true }}>
          <shaderMaterial
            ref={coneMatRef}
            vertexShader={BEAM_VERTEX_SHADER}
            fragmentShader={BEAM_FRAGMENT_SHADER}
            uniforms={coneUniforms}
            transparent
            depthWrite={false}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            clippingPlanes={BEAM_CLIP_PLANES}
          />
        </mesh>
      )}
    </group>
  );
}

// ── Node helpers for PlacedObject ─────────────────────────────────────────────

export function findBeamOriginNode(
  model: THREE.Group,
  features: ReadonlyArray<BoundFeature>,
): THREE.Object3D | null {
  // Prefer the innermost moving node (tilt), fall back to pan.
  const tiltBound = features.find((b) => b.feature.type === "tilt");
  if (tiltBound) {
    return getCachedNode(model, (tiltBound.config as TiltConfig).modelNode);
  }

  const panBound = features.find((b) => b.feature.type === "pan");
  if (panBound) {
    return getCachedNode(model, (panBound.config as PanConfig).modelNode);
  }

  return null;
}
