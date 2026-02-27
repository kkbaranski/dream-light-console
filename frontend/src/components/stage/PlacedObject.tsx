/**
 * Generic 3D object renderer driven by the device registry.
 *
 * Capabilities declared in DEVICE_REGISTRY[type] are applied automatically:
 *   pan       → rotates the named GLTF node around Y each frame
 *   tilt      → rotates the named GLTF node around X each frame
 *   beam      → renders a spotlight (fires in -Y / downward) + optional volumetric cone
 *   innerPole → extends the named GLTF node's Y position
 *
 * The coordinate overlay (X/Y/Z on drag) is shown for every object type.
 * Selection box is shown for every object type.
 *
 * Adding a new device type that uses only existing capabilities requires
 * zero changes to this file — only registry.ts and objectTypeDefs.tsx.
 */

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import type { SceneObject } from "../../scene/types";
import { useObjectDrag } from "../../hooks/useObjectDrag";
import { DEVICE_REGISTRY } from "../../devices/registry";
import type { DeviceDef } from "../../devices/registry";
import { WALL_Z } from "./sceneConstants";

// Preload all device models at module load time so they are ready before
// the first instance of each type is placed on the stage.
for (const def of Object.values(DEVICE_REGISTRY)) {
  useGLTF.preload(def.modelPath);
}

const DEG = Math.PI / 180;
const SELECTION_PADDING = 0.1;
const CONE_LENGTH = 20;

// ── Volumetric beam ───────────────────────────────────────────────────────────
//
// Technique from threex.volumetricspotlight (Jerome Etienne), also used
// internally by @react-three/drei's SpotLight component.
//
// Renders the inner face (BackSide) of an open cone frustum with a ShaderMaterial
// that computes two falloff factors per-fragment:
//   1. Axial attenuation   — fades linearly with distance from the apex (world space).
//   2. Angular attenuation — surfaces facing the camera appear brighter,
//      mimicking forward scattering in haze/smoke (view-space dot product).
// BackSide eliminates the z-fighting stripes that DoubleSide causes on a thin cylinder.
// AdditiveBlending adds the beam colour on top of the scene without darkening it.

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

  uniform vec3  spotPosition;   // world-space apex (light source)
  uniform vec3  lightColor;
  uniform float attenuation;    // distance at which brightness reaches zero
  uniform float anglePower;     // higher = tighter bright centre
  uniform float opacity;        // master opacity (driven by dimmer)

  void main() {
    float axialFade = 1.0 - clamp(
      distance(vWorldPosition, spotPosition) / attenuation,
      0.0, 1.0
    );

    vec3  normal      = vec3(vNormal.x, vNormal.y, abs(vNormal.z));
    float angularFade = pow(dot(normal, vec3(0.0, 0.0, 1.0)), anglePower);

    float intensity = axialFade * angularFade * opacity;
    gl_FragColor    = vec4(lightColor, intensity);
  }
`;

// Clipping planes stop the cone from poking through the floor or back wall.
// Pushed 0.1 m inside each surface so any residual edge hides under the geometry.
const BEAM_CLIP_PLANES = [
  new THREE.Plane(new THREE.Vector3(0, 1, 0),  0.1),           // clips below Y = -0.1
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z + 0.1),  // clips behind Z = WALL_Z - 0.1
];

// ── Generic property readers ──────────────────────────────────────────────────
// Read a typed value from a SceneObject using the field name as a string key.
// Returns defaultValue when the field is absent (e.g. the object type does not
// carry that property).  This keeps the renderer free of per-type switch statements.

// Module-level temporaries for allocation-free color blending in useFrame.
const _warmC = new THREE.Color();
const _coldC = new THREE.Color();

// Resolve the beam/glow color from whichever color capability the device declares.
// Returns a hex string; all three capability types converge to the same output so
// callers (glow material, spotlight prop, cone shader uniform) stay uniform.
function resolveDeviceColor(object: SceneObject, def: import("../../devices/registry").DeviceDef): string {
  if (def.rgbColor) {
    return readString(object, "color", def.rgbColor.defaultColor);
  }
  if (def.colorWheel) {
    const index = Math.min(
      readNumber(object, "colorWheelIndex", def.colorWheel.defaultIndex),
      def.colorWheel.colors.length - 1,
    );
    return def.colorWheel.colors[index].hex;
  }
  if (def.dualWhite) {
    const wn = readNumber(object, "warmLevel", 0) / 255;
    const cn = readNumber(object, "coldLevel", 255) / 255;
    _warmC.set(def.dualWhite.warmColorHex).multiplyScalar(wn);
    _coldC.set(def.dualWhite.coldColorHex).multiplyScalar(cn);
    _warmC.add(_coldC);
    _warmC.r = Math.min(1, _warmC.r);
    _warmC.g = Math.min(1, _warmC.g);
    _warmC.b = Math.min(1, _warmC.b);
    return "#" + _warmC.getHexString();
  }
  return "#ffffff";
}

function readNumber(object: SceneObject, field: string, defaultValue: number): number {
  const value = (object as unknown as Record<string, unknown>)[field];
  return typeof value === "number" ? value : defaultValue;
}

function readString(object: SceneObject, field: string, defaultValue: string): string {
  const value = (object as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : defaultValue;
}

function readBoolean(object: SceneObject, field: string, defaultValue: boolean): boolean {
  const value = (object as unknown as Record<string, unknown>)[field];
  return typeof value === "boolean" ? value : defaultValue;
}

// ── Per-instance mesh ─────────────────────────────────────────────────────────

function PlacedObjectMesh({ object }: { object: SceneObject }) {
  const def        = DEVICE_REGISTRY[object.type] as DeviceDef;
  const isSelected = useStageEditorStore((state) => state.selectedIds.includes(object.id));

  const { handlePointerDown, coordsVisible, coordsOpacity } = useObjectDrag(
    object,
    { supportsGroupDrag: def.supportsGroupDrag, supportsAdditiveSelect: def.supportsAdditiveSelect },
    {
      onDragStart: () => useStageEditorStore.getState()._pauseHistory(),
      onDragEnd:   () => useStageEditorStore.getState()._resumeHistory(),
    },
  );

  // ── Load + normalise GLTF model ──────────────────────────────────────────────
  const { scene: rawScene } = useGLTF(def.modelPath);

  const innerPoleRestY = useRef<number>(0);
  const spotGroupRef   = useRef<THREE.Group>(null);
  const spotRef        = useRef<THREE.SpotLight>(null);
  const coneMatRef     = useRef<THREE.ShaderMaterial>(null);

  const {
    model, panNode, tiltNode, innerPoleNode, glowMat,
    scale, offset, maxExtension, selectionEdges, overlayPos,
  } = useMemo(() => {
    const model = rawScene.clone(true);

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m: THREE.Material) => m.clone())
        : mesh.material.clone();
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
    });

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = def.targetHeight / size.y;

    const offset: [number, number, number] = [
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    ];

    const panNode       = def.pan       ? (model.getObjectByName(def.pan.nodeName)       ?? null) : null;
    const tiltNode      = def.tilt      ? (model.getObjectByName(def.tilt.nodeName)      ?? null) : null;
    const innerPoleNode = def.innerPole ? (model.getObjectByName(def.innerPole.nodeName) ?? null) : null;

    if (innerPoleNode) innerPoleRestY.current = innerPoleNode.position.y;

    // maxExtension is in raw (unscaled) model space, matching the pole node's Y units.
    const maxExtension = size.y * 0.5;

    let glowMat: THREE.MeshStandardMaterial | null = null;
    if (def.beam?.glowMaterialName) {
      model.traverse((child) => {
        if (glowMat) return;
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m.name === def.beam!.glowMaterialName) { glowMat = m as THREE.MeshStandardMaterial; break; }
        }
      });
    }

    const ww = size.x * scale + SELECTION_PADDING;
    const wh = def.targetHeight    + SELECTION_PADDING;
    const wd = size.z * scale + SELECTION_PADDING;
    const selectionEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(ww, wh, wd));
    const overlayPos: [number, number, number] = [ww / 2 + 0.05, wh, wd / 2 + 0.05];

    return {
      model, panNode, tiltNode, innerPoleNode,
      glowMat: glowMat as THREE.MeshStandardMaterial | null,
      scale, offset, maxExtension, selectionEdges, overlayPos,
    };
  }, [rawScene, def]);

  // ── Spotlight group: world-space, synced to the beam origin node each frame ──
  // The beam originates from the tilt node (moving head) or pan node as fallback.
  const beamOriginNode = tiltNode ?? panNode;

  useFrame(() => {
    if (!def.beam || !beamOriginNode || !spotGroupRef.current) return;

    beamOriginNode.getWorldPosition(spotGroupRef.current.position);
    beamOriginNode.getWorldQuaternion(spotGroupRef.current.quaternion);

    if (coneMatRef.current) {
      spotGroupRef.current.getWorldPosition(
        coneMatRef.current.uniforms.spotPosition.value as THREE.Vector3,
      );
      (coneMatRef.current.uniforms.lightColor.value as THREE.Color).set(
        resolveDeviceColor(object, def),
      );

      const dimmer  = readNumber(object, "dimmer", 255);
      const powered = readBoolean(object, "powered", true);
      const coneOpacity = powered && def.beam.coneOpacity
        ? def.beam.coneOpacity * (dimmer / 255)
        : 0;
      coneMatRef.current.uniforms.opacity.value = coneOpacity;
    }
  });

  // Target lives as a child of the spotlight at local [0,-1,0] so the light
  // always fires in the beam origin node's -Y (lens) direction.
  useEffect(() => {
    if (!def.beam) return;
    const spot = spotRef.current;
    if (!spot) return;
    spot.target.position.set(0, -1, 0);
    spot.add(spot.target);
    return () => { spot.remove(spot.target); };
  }, [def.beam]);

  // ── Animate capabilities ──────────────────────────────────────────────────────

  if (panNode && def.pan) {
    panNode.rotation.y = (readNumber(object, "pan", 128) / 255 - 0.5) * def.pan.totalDegrees * DEG;
  }

  if (tiltNode && def.tilt) {
    const tiltValue = readNumber(object, "tilt", 128);
    tiltNode.rotation.x =
      (def.tilt.startDegrees + (tiltValue / 255) * def.tilt.totalDegrees) * DEG;
  }

  if (glowMat && def.beam) {
    const dimmer  = readNumber(object, "dimmer", 255);
    const powered = readBoolean(object, "powered", true);
    glowMat.emissive.set(resolveDeviceColor(object, def));
    glowMat.emissiveIntensity = powered ? (dimmer / 255) * 4 : 0;
  }

  if (innerPoleNode && def.innerPole) {
    const height = readNumber(object, "height", 0);
    innerPoleNode.position.y = innerPoleRestY.current + height * maxExtension;
  }

  // ── Beam cone geometry ────────────────────────────────────────────────────────
  // coneAngle present in def → user-adjustable; read from object.
  // coneAngle absent in def → fixed; use fixedConeAngleDeg or fall back to 15°.
  const coneAngle = def.beam
    ? def.beam.coneAngle
      ? readNumber(object, "coneAngle", def.beam.coneAngle.default)
      : (def.beam.fixedConeAngleDeg ?? 15)
    : 0;
  const coneAngleRad = coneAngle * DEG;
  const lensRadius   = def.beam?.lensRadius ?? 0.08;

  const coneGeometry = useMemo(() => {
    if (!def.beam) return null;
    const farRadius = lensRadius + CONE_LENGTH * Math.tan(coneAngleRad);
    const geo = new THREE.CylinderGeometry(
      lensRadius,  // top radius (lens end)
      farRadius,   // bottom radius (far end)
      CONE_LENGTH,
      128,  // radialSegments — high count eliminates visible faceting at rim
      1,    // heightSegments — shader computes gradient analytically
      true, // openEnded — no caps
    );
    // Shift apex to origin, base extends toward -Y (downward, matching lens direction).
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -CONE_LENGTH / 2, 0));
    return geo;
  }, [def.beam, coneAngleRad, lensRadius]);

  useEffect(() => () => { coneGeometry?.dispose(); }, [coneGeometry]);

  // Uniforms are created once; values are updated imperatively in useFrame.
  const coneUniforms = useMemo(() => ({
    spotPosition: { value: new THREE.Vector3() },
    lightColor:   { value: new THREE.Color("#ffffff") },
    attenuation:  { value: CONE_LENGTH },
    anglePower:   { value: 2.0 },
    opacity:      { value: 0.0 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // intentionally no deps — updated imperatively in useFrame

  // ── Beam light props (derived once per render, not in useFrame) ───────────────
  const dimmerNorm  = def.beam ? readNumber(object, "dimmer", 255) / 255 : 0;
  const powered     = def.beam ? readBoolean(object, "powered", true) : false;
  const deviceColor = resolveDeviceColor(object, def);
  const lensOffset  = def.beam?.lensOffset ?? 0;

  // ── Object rotation (only objects that carry rotationX/Y/Z use non-zero values) ─
  const rotationX = readNumber(object, "rotationX", 0);
  const rotationY = readNumber(object, "rotationY", 0);
  const rotationZ = readNumber(object, "rotationZ", 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fixture body */}
      <group
        position={object.position}
        rotation={[rotationX * DEG, rotationY * DEG, rotationZ * DEG]}
        userData={{ placedObjectId: object.id }}
        onPointerDown={handlePointerDown}
      >
        <group scale={scale}>
          <primitive object={model} position={offset} />
        </group>

        {isSelected && (
          <lineSegments
            position={[0, def.targetHeight / 2, 0]}
            geometry={selectionEdges}
          >
            <lineBasicMaterial color="#ff2222" />
          </lineSegments>
        )}

        {coordsVisible && (
          <Html position={overlayPos} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(0,0,0,0.55)",
              color: "rgba(255,255,255,0.92)",
              padding: "3px 6px",
              borderRadius: "4px",
              fontSize: "10px",
              fontFamily: "monospace",
              lineHeight: "1.6",
              whiteSpace: "nowrap",
              opacity: coordsOpacity,
              transition: "opacity 0.8s ease",
              userSelect: "none",
            }}>
              <div>X {object.position[0].toFixed(2)}</div>
              <div>Y {object.position[1].toFixed(2)}</div>
              <div>Z {object.position[2].toFixed(2)}</div>
            </div>
          </Html>
        )}
      </group>

      {/* Spotlight + volumetric beam cone — only for devices with beam capability */}
      {def.beam && (
        <group ref={spotGroupRef}>
          <spotLight
            ref={spotRef}
            position={[0, -lensOffset, 0]}
            color={deviceColor}
            intensity={powered ? dimmerNorm * 100 : 0}
            angle={coneAngleRad}
            penumbra={0.2}
            distance={150}
            decay={1.5}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.001}
          />

          {def.beam.coneOpacity && def.beam.coneOpacity > 0 && coneGeometry && (
            <mesh geometry={coneGeometry}>
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
      )}
    </>
  );
}

export function PlacedObject({ object }: { object: SceneObject }) {
  return (
    <Suspense fallback={null}>
      <PlacedObjectMesh object={object} />
    </Suspense>
  );
}
