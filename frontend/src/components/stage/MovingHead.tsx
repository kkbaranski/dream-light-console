import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import type { LightObject } from "../../store/stageEditorStore";
import { useObjectDrag } from "../../hooks/useObjectDrag";
import { MOVING_HEAD_DEF } from "../../devices/movingHead";

useGLTF.preload(MOVING_HEAD_DEF.modelPath);

const DEG = Math.PI / 180;
const SELECTION_PADDING = 0.08;

function MovingHeadMesh({ light }: { light: LightObject }) {
  const isSelected = useStageEditorStore((s) => s.selectedIds.includes(light.id));

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
      const scale = MOVING_HEAD_DEF.targetHeight / size.y;

      const offset: [number, number, number] = [
        -(box.min.x + box.max.x) / 2,
        -box.min.y,
        -(box.min.z + box.max.z) / 2,
      ];

      const yokeNode = MOVING_HEAD_DEF.pan
        ? (model.getObjectByName(MOVING_HEAD_DEF.pan.nodeNames[0])  ?? null)
        : null;
      const headNode = MOVING_HEAD_DEF.tilt
        ? (model.getObjectByName(MOVING_HEAD_DEF.tilt.nodeNames[0]) ?? null)
        : null;

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

  // ── Spotlight: a group synced to the Head node carries the light ──────────────
  // We read the head node's world position and quaternion each frame and copy
  // them onto the group, so the spotlight always fires from the lens in the
  // direction the head is physically pointing.
  const spotGroupRef = useRef<THREE.Group>(null);
  const spotRef      = useRef<THREE.SpotLight>(null);

  useFrame(() => {
    if (!headNode || !spotGroupRef.current) return;
    headNode.getWorldPosition(spotGroupRef.current.position);
    headNode.getWorldQuaternion(spotGroupRef.current.quaternion);
  });

  // Add the spotlight's target as a child at local +Z so it always points
  // in the head node's forward (lens) direction.
  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;
    spot.target.position.set(0, 0, 1);
    spot.add(spot.target);
    return () => { spot.remove(spot.target); };
  }, []);

  // ── Animate pan / tilt / glow ─────────────────────────────────────────────────
  const { pan: panDef, tilt: tiltDef } = MOVING_HEAD_DEF;

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

  const coneAngleRad = light.coneAngle * DEG;
  const lensOffset   = MOVING_HEAD_DEF.beam?.lensOffset ?? 0.06;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fixture body */}
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

      {/* Spotlight group lives in world space. useFrame copies the head node's
          world position + quaternion onto this group each frame, so the light
          always originates from the lens and points wherever the head is aimed. */}
      <group ref={spotGroupRef}>
        <spotLight
          ref={spotRef}
          position={[0, 0, lensOffset]}
          color={light.color}
          intensity={light.powered ? (light.dimmer / 255) * 100 : 0}
          angle={coneAngleRad}
          penumbra={0.2}
          distance={150}
          decay={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.001}
        />
      </group>
    </>
  );
}

export function MovingHead({ light }: { light: LightObject }) {
  return (
    <Suspense fallback={null}>
      <MovingHeadMesh light={light} />
    </Suspense>
  );
}
