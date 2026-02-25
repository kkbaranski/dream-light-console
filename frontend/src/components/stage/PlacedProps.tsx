import { Suspense, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useStageEditorStore, isProp, isTripod } from "../../store/stageEditorStore";
import type { PropObject } from "../../scene/types";
import { useObjectDrag } from "../../hooks/useObjectDrag";

export const PROP_MODEL_PATHS: Record<string, string> = {
  speaker_1:        "/models/speakers/speaker_1.glb",
  speaker_2:        "/models/speakers/speaker_2.glb",
  tripod:           "/models/stands/tripod.glb",
  tripod_with_bar:  "/models/stands/tripod_with_bar.glb",
  mic:              "/models/mic.glb",
  barricade:        "/models/barricade.glb",
  disco_ball:       "/models/other/disco_ball.glb",
  disco_ball2:      "/models/other/disco_ball2.glb",
};

const PROP_TARGET_HEIGHTS: Record<string, number> = {
  speaker_1:       3.0,
  speaker_2:       2.5,
  tripod:          8.0,
  tripod_with_bar: 8.0,
  mic:             3.0,
  barricade:       2.5,
  disco_ball:      1.5,
  disco_ball2:     1.5,
};

const SELECTION_PADDING = 0.12;

Object.values(PROP_MODEL_PATHS).forEach((path) => useGLTF.preload(path));

function PlacedPropMesh({ prop }: { prop: PropObject }) {
  const isSelected = useStageEditorStore(
    (state) => state.selectedIds.includes(prop.id),
  );

  const { handlePointerDown } = useObjectDrag(
    prop,
    { supportsGroupDrag: false, supportsAdditiveSelect: false },
    {
      onDragStart: () => useStageEditorStore.getState()._pauseHistory(),
      onDragEnd:   () => useStageEditorStore.getState()._resumeHistory(),
    },
  );

  const path = PROP_MODEL_PATHS[prop.type];
  const { scene } = useGLTF(path);

  const innerPoleRestY = useRef<number>(0);

  const { clonedScene, normalizedScale, localOffset, innerPoleNode, maxExtension, selectionEdges, selectionCenter } =
    useMemo(() => {
      const cloned = scene.clone(true);

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

      const targetHeight = PROP_TARGET_HEIGHTS[prop.type] ?? 2.0;
      const scale = targetHeight / size.y;
      const offset: [number, number, number] = [-center.x, -box.min.y, -center.z];

      const pole = isTripod(prop)
        ? (cloned.getObjectByName("InnerPole") ?? null)
        : null;
      if (pole) innerPoleRestY.current = pole.position.y;

      const maxExt = size.y * 0.5;

      const edges = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          size.x * scale + SELECTION_PADDING,
          targetHeight + SELECTION_PADDING,
          size.z * scale + SELECTION_PADDING,
        ),
      );
      const boxCenter: [number, number, number] = [0, targetHeight / 2, 0];

      return {
        clonedScene: cloned,
        normalizedScale: scale,
        localOffset: offset,
        innerPoleNode: pole,
        maxExtension: maxExt,
        selectionEdges: edges,
        selectionCenter: boxCenter,
      };
    }, [scene, prop.type]);

  if (innerPoleNode && isTripod(prop)) {
    innerPoleNode.position.y = innerPoleRestY.current + prop.height * maxExtension;
  }

  return (
    <group
      position={prop.position}
      userData={{ isProp: true, placedObjectId: prop.id }}
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
    </group>
  );
}

export function PlacedProps() {
  const objects = useStageEditorStore((state) => state.objects);
  const props = objects.filter(isProp) as PropObject[];

  return (
    <>
      {props.map((prop) =>
        PROP_MODEL_PATHS[prop.type] ? (
          <Suspense key={prop.id} fallback={null}>
            <PlacedPropMesh prop={prop} />
          </Suspense>
        ) : null,
      )}
    </>
  );
}
