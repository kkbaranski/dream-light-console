import { Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore, type PlacedLight } from "../../store/stageEditorStore";
import { useLightDrag } from "../../hooks/useLightDrag";

const MOVING_HEAD_PATH = "/models/lights/moving_head.glb";
const TARGET_HEIGHT     = 2;
const PAN_RANGE_DEG     = 540;
const TILT_START_DEG    = 90;
const TILT_RANGE_DEG    = 359;
const BEAM_LENGTH_METRES = 100;
const LENS_OFFSET_METRES = 0.06;
const LENS_RADIUS_METRES = 0.08;
const SELECTION_PADDING  = 0.08;
const DEG_TO_RAD = Math.PI / 180;

useGLTF.preload(MOVING_HEAD_PATH);

function MovingHeadMesh({ light }: { light: PlacedLight }) {
  const { scene } = useGLTF(MOVING_HEAD_PATH);
  const isSelected = useStageEditorStore((state) => state.selectedLightIds.includes(light.id));

  const [showCoords, setShowCoords] = useState(false);
  const [coordsOpacity, setCoordsOpacity] = useState(1);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const { handlePointerDown } = useLightDrag(light, {
    onDragStart: () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      setShowCoords(true);
      setCoordsOpacity(1);
    },
    onDragEnd: () => {
      setCoordsOpacity(0);
      fadeTimerRef.current = setTimeout(() => setShowCoords(false), 800);
    },
  });

  const beamGroupRef = useRef<THREE.Group>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);

  const {
    clonedScene,
    yokeNode,
    headNode,
    glowMat,
    normalizedScale,
    localOffset,
    selectionEdges,
    selectionCenter,
    panelPosition,
  } = useMemo(() => {
    const cloned = scene.clone(true);

    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material: THREE.Material) => material.clone())
        : mesh.material.clone();
    });

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const scale = TARGET_HEIGHT / size.y;
    const offset: [number, number, number] = [-center.x, -box.min.y, -center.z];

    const yoke = cloned.getObjectByName("Yoke") ?? null;
    const head = cloned.getObjectByName("Head") ?? null;

    let glow: THREE.MeshStandardMaterial | null = null;
    cloned.traverse((child) => {
      if (glow) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material.name === "Glow") { glow = material as THREE.MeshStandardMaterial; break; }
      }
    });

    const edges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(
        size.x * scale + SELECTION_PADDING,
        TARGET_HEIGHT + SELECTION_PADDING,
        size.z * scale + SELECTION_PADDING,
      ),
    );
    const boxCenter: [number, number, number] = [0, TARGET_HEIGHT / 2, 0];
    const panelPos: [number, number, number] = [
      size.x * scale / 2 + SELECTION_PADDING / 2 + 0.05,
      TARGET_HEIGHT + SELECTION_PADDING / 2,
      size.z * scale / 2 + SELECTION_PADDING / 2 + 0.05,
    ];

    return {
      clonedScene: cloned,
      yokeNode: yoke,
      headNode: head,
      glowMat: glow as THREE.MeshStandardMaterial | null,
      normalizedScale: scale,
      localOffset: offset,
      selectionEdges: edges,
      selectionCenter: boxCenter,
      panelPosition: panelPos,
    };
  }, [scene]);

  useFrame(() => {
    if (!headNode || !beamGroupRef.current) return;
    headNode.getWorldPosition(beamGroupRef.current.position);
    headNode.getWorldQuaternion(beamGroupRef.current.quaternion);
  });

  useEffect(() => {
    const spotLight = spotLightRef.current;
    if (!spotLight) return;
    spotLight.target.position.set(0, 0, 1);
    spotLight.add(spotLight.target);
    return () => { spotLight.remove(spotLight.target); };
  }, []);

  if (yokeNode) yokeNode.rotation.y = (light.pan / 255 - 0.5) * PAN_RANGE_DEG * DEG_TO_RAD;
  if (headNode) headNode.rotation.x = (TILT_START_DEG + (light.tilt / 255) * TILT_RANGE_DEG) * DEG_TO_RAD;
  if (glowMat) {
    glowMat.emissive.set(light.color);
    glowMat.emissiveIntensity = light.powered ? (light.dimmer / 255) * 4 : 0;
  }

  const coneAngleRad  = light.coneAngle * DEG_TO_RAD;
  const beamFarRadius = BEAM_LENGTH_METRES * Math.tan(coneAngleRad);
  const beamOpacity   = light.powered ? (light.dimmer / 255) * 0.10 : 0;

  return (
    <>
      <group
        position={light.position}
        rotation={[light.rotationX * DEG_TO_RAD, light.rotationY * DEG_TO_RAD, light.rotationZ * DEG_TO_RAD]}
        onPointerDown={handlePointerDown}
      >
        <group scale={normalizedScale}>
          <primitive object={clonedScene} position={localOffset} />
        </group>

        {isSelected && (
          <lineSegments position={selectionCenter} geometry={selectionEdges}>
            <lineBasicMaterial color="#ff2222" />
          </lineSegments>
        )}

        {showCoords && (
          <Html position={panelPosition} style={{ pointerEvents: "none" }}>
            <div
              style={{
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
              }}
            >
              <div>X {light.position[0].toFixed(2)}</div>
              <div>Y {light.position[1].toFixed(2)}</div>
              <div>Z {light.position[2].toFixed(2)}</div>
            </div>
          </Html>
        )}
      </group>

      {/* World-space beam — position/rotation synced to the Head node via useFrame */}
      <group ref={beamGroupRef}>
        <mesh
          position={[0, 0, LENS_OFFSET_METRES + BEAM_LENGTH_METRES / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={{ isBeam: true }}
        >
          <cylinderGeometry args={[LENS_RADIUS_METRES, beamFarRadius, BEAM_LENGTH_METRES, 32, 1, true]} />
          <meshBasicMaterial
            color={light.color}
            transparent
            opacity={beamOpacity}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        <spotLight
          ref={spotLightRef}
          position={[0, 0, LENS_OFFSET_METRES]}
          color={light.color}
          intensity={light.powered ? (light.dimmer / 255) * 40 : 0}
          angle={coneAngleRad}
          penumbra={0.15}
          distance={BEAM_LENGTH_METRES}
          decay={1.5}
          castShadow={false}
        />
      </group>
    </>
  );
}

export function PlacedLights() {
  const placedLights = useStageEditorStore((state) => state.placedLights);

  return (
    <>
      {placedLights.map((light) => (
        <Suspense key={light.id} fallback={null}>
          <MovingHeadMesh light={light} />
        </Suspense>
      ))}
    </>
  );
}
