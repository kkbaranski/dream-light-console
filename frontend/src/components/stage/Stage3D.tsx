import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useStage3DStore } from "../../store/stage3dStore";
import type { Stage3DObjectType } from "../../store/stage3dStore";
import { SceneObjects } from "./objects/SceneObjects";
import { PlaceObjectModal } from "./PlaceObjectModal";

interface PendingDrop {
  type: Stage3DObjectType;
  position: [number, number, number];
}

export function Stage3D() {
  const cameraRef = useRef<THREE.Camera | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const addObject = useStage3DStore((s) => s.addObject);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData("stage3d/type") as Stage3DObjectType;
    if (!type) return;

    const camera = cameraRef.current;
    const div = canvasRef.current;
    if (!camera || !div) return;

    const rect = div.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Intersect with ground plane Y=0
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, target);

    setPendingDrop({
      type,
      position: [
        parseFloat(target.x.toFixed(2)),
        0,
        parseFloat(target.z.toFixed(2)),
      ],
    });
  }

  return (
    <div
      ref={canvasRef}
      className="relative flex-1 overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [2.5, 3.5, 4], fov: 50 }}
        onCreated={({ scene, camera }) => {
          scene.background = new THREE.Color("#111111");
          cameraRef.current = camera;
        }}
      >
        {/* Atmospheric fog */}
        <fog attach="fog" args={["#111111", 12, 30]} />

        {/* Fill lights */}
        <ambientLight intensity={0.18} />
        <directionalLight position={[4, 8, 4]} intensity={0.5} />
        <directionalLight position={[-4, 4, -2]} intensity={0.15} color="#334" />

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[16, 16]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.85} metalness={0.05} />
        </mesh>

        <SceneObjects />

        <OrbitControls
          target={[0, 2, 0]}
          enablePan={false}
          minDistance={3}
          maxDistance={20}
        />

        <EffectComposer>
          <Bloom intensity={0.8} luminanceThreshold={0.6} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {pendingDrop && (
        <PlaceObjectModal
          type={pendingDrop.type}
          dropPosition={pendingDrop.position}
          onConfirm={(obj) => {
            addObject(obj);
            setPendingDrop(null);
          }}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </div>
  );
}
