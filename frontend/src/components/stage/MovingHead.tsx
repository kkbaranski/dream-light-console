import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import type { LightObject } from "../../store/stageEditorStore";
import { useObjectDrag } from "../../hooks/useObjectDrag";
import { MOVING_HEAD_DEF } from "../../devices/movingHead";
import { WALL_Z } from "./sceneConstants";

useGLTF.preload(MOVING_HEAD_DEF.modelPath);

const DEG = Math.PI / 180;
const SELECTION_PADDING = 0.08;

// ── Module-level constants (created once, shared across all instances) ────────

// AlphaMap: opaque near the lens (cylinder top, UV v=1), fades out over the
// last quarter of the beam toward the far end (cylinder bottom, UV v=0).
const BEAM_FADE_TEXTURE = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0,    "#000000"); // UV v=0 — far end  → transparent
  g.addColorStop(0.25, "#ffffff"); // fade zone ends here
  g.addColorStop(1,    "#ffffff"); // UV v=1 — lens end → opaque
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 64);
  return new THREE.CanvasTexture(canvas);
})();

// Clipping planes prevent the beam cone from penetrating the floor (Y < 0)
// and the back wall (Z < WALL_Z).
// Requires <Canvas gl={{ localClippingEnabled: true }}> in StageScene.
const BEAM_CLIP_PLANES = [
  new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),        // clips below floor
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z),  // clips behind wall
];

// ── Per-instance mesh ─────────────────────────────────────────────────────────

function MovingHeadMesh({ light }: { light: LightObject }) {
  const isSelected = useStageEditorStore((s) => s.selectedIds.includes(light.id));

  // Coordinate overlay fades in on drag start, fades out on drag end.
  const [coordsVisible, setCoordsVisible] = useState(false);
  const [coordsOpacity, setCoordsOpacity] = useState(1);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); }, []);

  const { handlePointerDown } = useObjectDrag(
    light,
    { supportsGroupDrag: true, supportsAdditiveSelect: true },
    {
      onDragStart: () => {
        useStageEditorStore.getState()._pauseHistory();
        if (fadeTimer.current) clearTimeout(fadeTimer.current);
        setCoordsVisible(true);
        setCoordsOpacity(1);
      },
      onDragEnd: () => {
        useStageEditorStore.getState()._resumeHistory();
        setCoordsOpacity(0);
        fadeTimer.current = setTimeout(() => setCoordsVisible(false), 800);
      },
    },
  );

  // ── Load + normalise GLTF model ──────────────────────────────────────────────
  const { scene: rawScene } = useGLTF(MOVING_HEAD_DEF.modelPath);

  const { model, yokeNode, headNode, glowMat, scale, offset, selectionEdges, overlayPos } =
    useMemo(() => {
      const model = rawScene.clone(true);

      // Each instance needs independent material state (glow colour, emission).
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m: THREE.Material) => m.clone())
          : mesh.material.clone();
      });

      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());

      // Scale the model so its height matches targetHeight in world units.
      const scale = MOVING_HEAD_DEF.targetHeight / size.y;

      // Offset applied inside the scaled group: centres the model and puts its
      // bottom at Y=0 in local (pre-scale) space.
      const offset: [number, number, number] = [
        -(box.min.x + box.max.x) / 2,
        -box.min.y,
        -(box.min.z + box.max.z) / 2,
      ];

      // Resolve model nodes named in the device definition.
      const yokeNode = MOVING_HEAD_DEF.pan
        ? (model.getObjectByName(MOVING_HEAD_DEF.pan.nodeNames[0])  ?? null)
        : null;
      const headNode = MOVING_HEAD_DEF.tilt
        ? (model.getObjectByName(MOVING_HEAD_DEF.tilt.nodeNames[0]) ?? null)
        : null;

      // Find the lens glow material by name.
      let glowMat: THREE.MeshStandardMaterial | null = null;
      const glowName = MOVING_HEAD_DEF.beam?.glowMaterialName;
      if (glowName) {
        model.traverse((child) => {
          if (glowMat) return;
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (m.name === glowName) { glowMat = m as THREE.MeshStandardMaterial; break; }
          }
        });
      }

      // World-space dimensions for the selection bounding box.
      const ww = size.x * scale + SELECTION_PADDING;
      const wh = MOVING_HEAD_DEF.targetHeight + SELECTION_PADDING;
      const wd = size.z * scale + SELECTION_PADDING;
      const selectionEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(ww, wh, wd));
      const overlayPos: [number, number, number] = [ww / 2 + 0.05, wh, wd / 2 + 0.05];

      return {
        model, yokeNode, headNode,
        glowMat: glowMat as THREE.MeshStandardMaterial | null,
        scale, offset, selectionEdges, overlayPos,
      };
    }, [rawScene]);

  // ── Beam: world-space group tracks the Head node each frame ──────────────────
  // The group lives outside the fixture group so it is not double-transformed.
  const beamGroupRef = useRef<THREE.Group>(null);
  const spotRef      = useRef<THREE.SpotLight>(null);

  useFrame(() => {
    if (!headNode || !beamGroupRef.current) return;
    headNode.getWorldPosition(beamGroupRef.current.position);
    headNode.getWorldQuaternion(beamGroupRef.current.quaternion);
  });

  // SpotLight must track its own target to fire along +Z of the beam group.
  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;
    spot.target.position.set(0, 0, 1);
    spot.add(spot.target);
    return () => { spot.remove(spot.target); };
  }, []);

  // ── Drive pan / tilt / glow every render ─────────────────────────────────────
  const { pan: panDef, tilt: tiltDef, beam: beamDef } = MOVING_HEAD_DEF;

  if (yokeNode && panDef) {
    yokeNode.rotation.y = (light.pan / 255 - 0.5) * panDef.totalDegrees * DEG;
  }
  if (headNode && tiltDef) {
    headNode.rotation.x =
      (tiltDef.startDegrees + (light.tilt / 255) * tiltDef.totalDegrees) * DEG;
  }
  if (glowMat) {
    glowMat.emissive.set(light.color);
    glowMat.emissiveIntensity = light.powered ? (light.dimmer / 255) * 4 : 0;
  }

  // ── Beam geometry derived from light state ────────────────────────────────────
  const coneAngleRad = light.coneAngle * DEG;
  const beamLength   = beamDef?.maxLength  ?? 20;
  const lensOffset   = beamDef?.lensOffset ?? 0.06;
  const lensRadius   = beamDef?.lensRadius ?? 0.08;
  const farRadius    = beamLength * Math.tan(coneAngleRad);
  const beamOpacity  = light.powered ? (light.dimmer / 255) * 0.10 : 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fixture body: positioned at light.position in world space */}
      <group
        position={light.position}
        rotation={[light.rotationX * DEG, light.rotationY * DEG, light.rotationZ * DEG]}
        userData={{ placedObjectId: light.id }}
        onPointerDown={handlePointerDown}
      >
        <group scale={scale}>
          <primitive object={model} position={offset} />
        </group>

        {isSelected && (
          <lineSegments
            position={[0, MOVING_HEAD_DEF.targetHeight / 2, 0]}
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
              <div>X {light.position[0].toFixed(2)}</div>
              <div>Y {light.position[1].toFixed(2)}</div>
              <div>Z {light.position[2].toFixed(2)}</div>
            </div>
          </Html>
        )}
      </group>

      {/* Beam + spotlight live in world space; useFrame tracks the Head node. */}
      <group ref={beamGroupRef}>
        {/*
          Cone fires along +Z of this group (which mirrors the Head node orientation).
          Clipping planes prevent it from penetrating the floor or back wall.
          AlphaMap fades it out smoothly at the far end instead of cutting abruptly.
        */}
        <mesh
          position={[0, 0, lensOffset + beamLength / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={{ isBeam: true }}
        >
          <cylinderGeometry args={[lensRadius, farRadius, beamLength, 32, 1, true]} />
          <meshBasicMaterial
            color={light.color}
            transparent
            opacity={beamOpacity}
            alphaMap={BEAM_FADE_TEXTURE}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            clippingPlanes={BEAM_CLIP_PLANES}
          />
        </mesh>

        <spotLight
          ref={spotRef}
          position={[0, 0, lensOffset]}
          color={light.color}
          intensity={light.powered ? (light.dimmer / 255) * 40 : 0}
          angle={coneAngleRad}
          penumbra={0.15}
          distance={beamLength}
          decay={1.5}
          castShadow={false}
        />
      </group>
    </>
  );
}

// ── Public export: wraps in Suspense for async GLTF loading ──────────────────

export function MovingHead({ light }: { light: LightObject }) {
  return (
    <Suspense fallback={null}>
      <MovingHeadMesh light={light} />
    </Suspense>
  );
}
