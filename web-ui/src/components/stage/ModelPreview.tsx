import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

function ModelMesh({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  const { clonedScene, offset, scale } = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    return {
      clonedScene: cloned,
      offset: [-center.x, -center.y, -center.z] as [number, number, number],
      scale: 1 / maxDim,
    };
  }, [scene]);

  return (
    <group scale={scale}>
      <primitive object={clonedScene} position={offset} />
    </group>
  );
}

export function ModelPreview({ path }: { path: string }) {
  return (
    <Canvas
      shadows
      camera={{ position: [1, 1, 2], fov: 45 }}
      gl={{ antialias: true, localClippingEnabled: true, toneMapping: THREE.AgXToneMapping }}
      style={{ background: "#1f2937" }}
      onCreated={({ scene }) => { scene.environmentIntensity = 0.17; }}
    >
      <Environment preset="studio" />
      <Suspense fallback={null}>
        <ModelMesh path={path} />
      </Suspense>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={3}
      />
    </Canvas>
  );
}
