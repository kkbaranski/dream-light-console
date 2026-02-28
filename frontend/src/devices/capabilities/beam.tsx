/**
 * Beam capability — everything related to emitting light from a fixture:
 *   applyToModel   – drives the lens glow material (colour + intensity)
 *   BeamRenderer   – sibling R3F component: spotlight + volumetric cone
 *   Inspector      – beam-angle slider (when the angle is user-adjustable)
 *
 * Colour resolution reads from whichever colour capability is also declared
 * on the device (rgbColor, colorWheel, or dualWhite), accessed via boundCaps.
 */

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getCachedNode, readField, type CapabilityDef, type CapObject, type BoundCapability } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";
import { WALL_Z } from "../../components/stage/sceneConstants";

// ── Colour resolution ─────────────────────────────────────────────────────────
// Resolves the active beam colour from whichever colour capability is bound.
// Temporary Color objects are module-level to avoid allocation on the hot path.

const temporaryWarmColor = new THREE.Color();
const temporaryColdColor = new THREE.Color();

export function resolveBeamColor(
  obj: CapObject,
  boundCaps: ReadonlyArray<BoundCapability>,
): string {
  for (const { cap, config } of boundCaps) {
    if (cap.type === "rgbColor") {
      return readField<string>(obj, "color", (config as { defaultColor: string }).defaultColor);
    }

    if (cap.type === "colorWheel") {
      const cfg = config as { colors: Array<{ hex: string }>; defaultIndex: number };
      const index = Math.min(
        readField<number>(obj, "colorWheelIndex", cfg.defaultIndex),
        cfg.colors.length - 1,
      );
      return cfg.colors[index].hex;
    }

    if (cap.type === "dualWhite") {
      const cfg = config as { warmColorHex: string; coldColorHex: string };
      const warmNormalized = readField<number>(obj, "warmLevel", 0) / 255;
      const coldNormalized = readField<number>(obj, "coldLevel", 255) / 255;
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

// ── Beam capability definition ────────────────────────────────────────────────

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

function findGlowMaterial(
  model: THREE.Group,
  materialName: string,
): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  model.traverse((child) => {
    if (found) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material.name === materialName) {
        found = material as THREE.MeshStandardMaterial;
        return;
      }
    }
  });
  return found;
}

export const beam: CapabilityDef<BeamConfig> = {
  type: "beam",

  defaultState: (config) => ({
    ...(config.coneAngle ? { coneAngle: config.coneAngle.default } : {}),
  }),

  dmxChannels: (config) =>
    config.coneAngle
      ? [{ offset: 0, label: "Beam Angle", field: "coneAngle", encoding: { kind: "linear8" } }]
      : [],

  applyToModel: (model, obj, config, boundCaps) => {
    const glowMaterialCacheKey = `_glowMat_${config.glowMaterialName}`;
    if (model.userData[glowMaterialCacheKey] === undefined) {
      model.userData[glowMaterialCacheKey] = findGlowMaterial(model, config.glowMaterialName);
    }

    const glowMaterial = model.userData[glowMaterialCacheKey] as THREE.MeshStandardMaterial | null;
    if (!glowMaterial) return;

    const dimmer  = readField<number>(obj, "dimmer", 255);
    const powered = readField<boolean>(obj, "powered", false);

    glowMaterial.emissive.set(resolveBeamColor(obj, boundCaps));
    glowMaterial.emissiveIntensity = powered ? (dimmer / 255) * 4 : 0;
  },

  Inspector: ({ ctx, config }) => {
    if (!config.coneAngle) return null;
    return (
      <>
        <SectionDivider label="Beam" />
        <ValueSlider
          label="Angle"
          value={
            ctx.shared((obj) => readField<number>(obj, "coneAngle", config.coneAngle!.default)) ??
            ctx.avgInt((obj) => readField<number>(obj, "coneAngle", config.coneAngle!.default))
          }
          isMixed={ctx.isMixed((obj) => readField<number>(obj, "coneAngle", config.coneAngle!.default))}
          min={config.coneAngle.min}
          max={config.coneAngle.max}
          unit="°"
          locked={ctx.isLocked("coneAngle")}
          onToggleLock={() => ctx.toggleLock("coneAngle")}
          onChange={(v) => ctx.update({ coneAngle: v })}
        />
      </>
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
const DEGREES_PER_RADIAN  = Math.PI / 180;
const CONE_RADIAL_SEGMENTS = 128;
const CONE_ANGLE_POWER     = 2.0;

const BEAM_CLIP_PLANES = [
  new THREE.Plane(new THREE.Vector3(0, 1, 0),  0.1),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z + 0.1),
];

export interface BeamRendererProps {
  obj: CapObject;
  config: BeamConfig;
  /** The beam-origin node (tiltNode ?? panNode) from the fixture model. */
  originNode: THREE.Object3D | null;
  /** All bound capabilities of this device — needed for colour resolution. */
  boundCaps: ReadonlyArray<BoundCapability>;
}

export function BeamRenderer({ obj, config, originNode, boundCaps }: BeamRendererProps) {
  const spotGroupRef = useRef<THREE.Group>(null);
  const spotRef      = useRef<THREE.SpotLight>(null);
  const coneMatRef   = useRef<THREE.ShaderMaterial>(null);

  const coneAngleDeg = config.coneAngle
    ? readField<number>(obj, "coneAngle", config.coneAngle.default)
    : (config.fixedConeAngleDeg ?? 15);
  const coneAngleRad = coneAngleDeg * DEGREES_PER_RADIAN;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const [bdX, bdY, bdZ] = config.beamLocalDir ?? [0, -1, 0];

  const coneRotation = useMemo((): [number, number, number] => {
    if (bdX === 0 && bdY === -1 && bdZ === 0) return [0, 0, 0];
    const from = new THREE.Vector3(0, -1, 0);
    const to   = new THREE.Vector3(bdX, bdY, bdZ).normalize();
    const q    = new THREE.Quaternion().setFromUnitVectors(from, to);
    const e    = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bdX, bdY, bdZ]);

  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;
    spot.target.position.set(bdX, bdY, bdZ);
    spot.add(spot.target);
    return () => { spot.remove(spot.target); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bdX, bdY, bdZ]);

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
      resolveBeamColor(obj, boundCaps),
    );

    const dimmer  = readField<number>(obj, "dimmer", 255);
    const powered = readField<boolean>(obj, "powered", false);
    coneMatRef.current.uniforms.opacity.value =
      powered && config.coneOpacity
        ? config.coneOpacity * (dimmer / 255)
        : 0;
  });

  const dimmerNormalized = readField<number>(obj, "dimmer", 255) / 255;
  const powered          = readField<boolean>(obj, "powered", false);
  const beamColor        = resolveBeamColor(obj, boundCaps);

  return (
    <group ref={spotGroupRef}>
      <spotLight
        ref={spotRef}
        position={spotlightLocalPos}
        color={beamColor}
        intensity={powered ? dimmerNormalized * 100 : 0}
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
        <mesh geometry={coneGeometry} position={spotlightLocalPos} rotation={coneRotation}>
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
  caps: ReadonlyArray<BoundCapability>,
): THREE.Object3D | null {
  const panTiltBound = caps.find((b) => b.cap.type === "panTilt");
  if (panTiltBound) {
    const cfg = panTiltBound.config as { panNodeName: string; tilt?: { nodeName: string } };
    const tiltNode = cfg.tilt ? getCachedNode(model, cfg.tilt.nodeName) : null;
    const panNode  = getCachedNode(model, cfg.panNodeName);
    return tiltNode ?? panNode;
  }

  const tiltBound = caps.find((b) => b.cap.type === "tilt");
  if (tiltBound) {
    const cfg = tiltBound.config as { nodeName: string; beamOriginNodeName?: string };
    return getCachedNode(model, cfg.beamOriginNodeName ?? cfg.nodeName);
  }

  return null;
}
