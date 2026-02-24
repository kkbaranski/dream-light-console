import { Suspense, useEffect, useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore, type PlacedLight } from "../../store/stageEditorStore";

const MOVING_HEAD_PATH = "/models/lights/moving_head.glb";
const TARGET_HEIGHT  = 2;    // metres
const PAN_RANGE_DEG  = 540;  // total pan sweep in degrees (±270°, standard moving-head spec)
const TILT_START_DEG = 90;  // beam angle at DMX 0, degrees (−90 = pointing at floor)
const TILT_RANGE_DEG = 359;  // total tilt travel in degrees
const DRAG_THRESHOLD_SQ = 25; // 5 px²

// Beam cone — adjust to match the fixture's physical geometry
const BEAM_LENGTH_M  = 100;  // how far the beam reaches in world metres
const LENS_Z_M       = 0.06; // lens face distance from Head pivot along beam axis (world metres)
const LENS_RADIUS_M  = 0.08; // lens physical radius (world metres)
// At any cone angle the apex is positioned so the cone's cross-section at the
// lens plane always equals the lens radius:  apexZ = LENS_Z_M - LENS_RADIUS_M / tan(angle)

const DEG = Math.PI / 180;

useGLTF.preload(MOVING_HEAD_PATH);

function MovingHeadMesh({ light }: { light: PlacedLight }) {
  const { scene } = useGLTF(MOVING_HEAD_PATH);
  const updateLight      = useStageEditorStore((state) => state.updateLight);
  const setSelectedLight = useStageEditorStore((state) => state.setSelectedLight);
  const isSelected       = useStageEditorStore((state) => state.selectedLightId === light.id);

  const camera   = useThree((state) => state.camera);
  const gl       = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls as { enabled: boolean } | null);

  const capturedPointerId = useRef<number | null>(null);
  const pointerDownScreen = useRef<{ x: number; y: number } | null>(null);
  const isDragging        = useRef(false);
  const dragPlane         = useRef(new THREE.Plane());
  const dragOffset        = useRef(new THREE.Vector3());

  // Beam cone — world-space group synced to the Head node each frame
  const beamGroupRef  = useRef<THREE.Group>(null);
  const spotLightRef  = useRef<THREE.SpotLight>(null);
  const _syncPos      = useRef(new THREE.Vector3());
  const _syncQuat     = useRef(new THREE.Quaternion());
  const _syncScale    = useRef(new THREE.Vector3());

  const { clonedScene, yokeNode, headNode, glowMat, normalizedScale, localOffset, selEdges, selCenter } =
    useMemo(() => {
      const cloned = scene.clone(true);

      // Clone all materials so instances are independent (separate colors per light)
      cloned.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m: THREE.Material) => m.clone())
          : mesh.material.clone();
      });

      const box = new THREE.Box3().setFromObject(cloned);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const scale  = TARGET_HEIGHT / size.y;
      const offset: [number, number, number] = [-center.x, -box.min.y, -center.z];

      // Locate the articulated nodes by the names set in Blender
      const yoke = cloned.getObjectByName("Yoke") ?? null;
      const head = cloned.getObjectByName("Head") ?? null;

      // Find the Glow material to drive lens colour
      let glow: THREE.MeshStandardMaterial | null = null;
      cloned.traverse((child) => {
        if (glow) return;
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m.name === "Glow") { glow = m as THREE.MeshStandardMaterial; break; }
        }
      });

      // Selection wireframe — dimensions are in world space (outside normalizedScale)
      const PAD = 0.08;
      const edges = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          size.x * scale + PAD,
          TARGET_HEIGHT + PAD,
          size.z * scale + PAD,
        ),
      );
      const boxCenter: [number, number, number] = [0, TARGET_HEIGHT / 2, 0];

      return {
        clonedScene: cloned,
        yokeNode: yoke,
        headNode: head,
        glowMat: glow as THREE.MeshStandardMaterial | null,
        normalizedScale: scale,
        localOffset: offset,
        selEdges: edges,
        selCenter: boxCenter,
      };
    }, [scene]);

  useEffect(() => {
    const canvas = gl.domElement;

    function onPointerMove(event: PointerEvent) {
      if (capturedPointerId.current !== event.pointerId) return;

      if (!isDragging.current) {
        if (!pointerDownScreen.current) return;
        const dx = event.clientX - pointerDownScreen.current.x;
        const dy = event.clientY - pointerDownScreen.current.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
        isDragging.current = true;
      }

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(dragPlane.current, hit)) return;

      updateLight(light.id, {
        position: [
          hit.x - dragOffset.current.x,
          Math.max(0, hit.y - dragOffset.current.y),
          hit.z - dragOffset.current.z,
        ],
      });
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== capturedPointerId.current) return;
      if (!isDragging.current) setSelectedLight(light.id);
      isDragging.current        = false;
      capturedPointerId.current = null;
      pointerDownScreen.current = null;
      if (controls) controls.enabled = true;
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup",   onPointerUp);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup",   onPointerUp);
    };
  }, [camera, controls, gl.domElement, light.id, updateLight, setSelectedLight]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();

    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    dragPlane.current.setFromNormalAndCoplanarPoint(cameraForward.negate(), event.point);
    dragOffset.current.set(
      event.point.x - light.position[0],
      event.point.y - light.position[1],
      event.point.z - light.position[2],
    );

    capturedPointerId.current = event.nativeEvent.pointerId;
    pointerDownScreen.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
    gl.domElement.setPointerCapture(event.nativeEvent.pointerId);
    if (controls) controls.enabled = false;
  }

  // Sync the world-space beam group to the Head node's world transform each frame.
  useFrame(() => {
    if (!headNode || !beamGroupRef.current) return;
    headNode.updateWorldMatrix(true, false);
    headNode.matrixWorld.decompose(_syncPos.current, _syncQuat.current, _syncScale.current);
    beamGroupRef.current.position.copy(_syncPos.current);
    beamGroupRef.current.quaternion.copy(_syncQuat.current);
  });

  // Point the SpotLight in the beam direction (local −Z) by making the target
  // a child of the light so it travels with it.
  useEffect(() => {
    const spotLight = spotLightRef.current;
    if (!spotLight) return;
    spotLight.target.position.set(0, 0, 1);
    spotLight.add(spotLight.target);
    return () => { spotLight.remove(spotLight.target); };
  }, []);

  // Drive pan/tilt/lens by mutating Three.js objects directly each render.
  // R3F picks up mutations on the next frame, so inspector changes propagate immediately.
  if (yokeNode) yokeNode.rotation.y = (light.pan / 255 - 0.5) * PAN_RANGE_DEG * DEG;
  if (headNode) headNode.rotation.x = (TILT_START_DEG + (light.tilt / 255) * TILT_RANGE_DEG) * DEG;
  if (glowMat) {
    glowMat.emissive.set(light.color);
    glowMat.emissiveIntensity = (light.dimmer / 255) * 4;
  }

  // CylinderGeometry: top radius = LENS_RADIUS_M (fixed, always matches the lens),
  // bottom radius = spread at throw distance.  The top face is pinned to the lens
  // face (LENS_Z_M), so the beam always appears to originate from the full lens
  // regardless of the cone angle.
  const coneAngleRad  = light.coneAngle * DEG;
  const beamFarRadius = BEAM_LENGTH_M * Math.tan(coneAngleRad);
  const beamOpacity   = (light.dimmer / 255) * 0.10;

  return (
    <>
      <group position={light.position} onPointerDown={handlePointerDown}>
        <group scale={normalizedScale}>
          <primitive object={clonedScene} position={localOffset} />
        </group>

        {isSelected && (
          <lineSegments position={selCenter} geometry={selEdges}>
            <lineBasicMaterial color="#ff2222" />
          </lineSegments>
        )}
      </group>

      {/* World-space beam — position/rotation synced to the Head node via useFrame */}
      <group ref={beamGroupRef}>
        {/*
          With rotation=[-π/2,0,0]: cylinderGeometry radiusTop→−Z (lens face),
          radiusBottom→+Z (far end).  Centre placed at LENS_Z_M + BEAM_LENGTH_M/2
          so the near face lands exactly on the lens.
        */}
        <mesh
          position={[0, 0, LENS_Z_M + BEAM_LENGTH_M / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[LENS_RADIUS_M, beamFarRadius, BEAM_LENGTH_M, 32, 1, true]} />
          <meshBasicMaterial
            color={light.color}
            transparent
            opacity={beamOpacity}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Spotlight sits at the lens face so illumination matches the visible beam */}
        <spotLight
          ref={spotLightRef}
          position={[0, 0, LENS_Z_M]}
          color={light.color}
          intensity={(light.dimmer / 255) * 40}
          angle={coneAngleRad}
          penumbra={0.15}
          distance={BEAM_LENGTH_M}
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
