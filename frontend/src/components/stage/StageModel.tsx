import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Must stay in sync with WALL_Z in StageScene.tsx
const WALL_Z = -10;
// Gap between the back of the stage and the wall surface
const GAP_FROM_WALL = 0.3;

function StageModelMesh({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  const [clonedScene, position] = useMemo(() => {
    const cloned = scene.clone(true);

    // Compute the axis-aligned bounding box of the model at its default pose
    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Place the model so that:
    //   X — horizontally centered on stage axis
    //   Y — bottom face sits flush on the floor (y = 0)
    //   Z — back face (min Z, facing the wall) is GAP_FROM_WALL in front of the wall
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
