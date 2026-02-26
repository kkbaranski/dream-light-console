import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { WALL_Z } from "./sceneConstants";

const GAP_FROM_WALL = 3;

function StageModelMesh({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  const [clonedScene, position] = useMemo(() => {
    const cloned = scene.clone(true);

    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
    });

    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const x = -center.x;
    const y = -box.min.y;
    const z = WALL_Z + GAP_FROM_WALL - box.min.z;

    return [cloned, [x, y, z] as [number, number, number]];
  }, [scene]);

  return <primitive object={clonedScene} position={position} />;
}

export function StageModel({ path }: { path: string }) {
  return (
    <Suspense fallback={null}>
      <StageModelMesh path={path} />
    </Suspense>
  );
}
