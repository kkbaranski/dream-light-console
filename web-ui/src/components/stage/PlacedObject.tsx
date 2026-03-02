import { Suspense, useMemo } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import type { SceneObject } from "../../scene/types";
import { useObjectDrag } from "../../hooks/useObjectDrag";
import { DEVICE_REGISTRY, activeCapabilities } from "../../devices/registry";
import type { BoundCapability } from "../../devices/capability";
import type { BeamConfig } from "../../devices/capabilities/beam";
import { BeamRenderer, findBeamOriginNode } from "../../devices/capabilities/beam";

for (const def of Object.values(DEVICE_REGISTRY)) {
  useGLTF.preload(def.modelPath);
}

const DEGREES_PER_RADIAN = Math.PI / 180;
const SELECTION_PADDING  = 0.1;

function PlacedObjectMesh({ object }: { object: SceneObject }) {
  const def        = DEVICE_REGISTRY[object.type];
  const isSelected = useStageEditorStore((state) => state.selectedIds.includes(object.id));
  const caps       = activeCapabilities(def, object.mode);

  const { handlePointerDown, coordsVisible, coordsOpacity } = useObjectDrag(
    object,
    { supportsGroupDrag: def.supportsGroupDrag, supportsAdditiveSelect: def.supportsAdditiveSelect },
    {
      onDragStart: () => useStageEditorStore.getState()._pauseHistory(),
      onDragEnd:   () => useStageEditorStore.getState()._resumeHistory(),
    },
  );

  const { scene: rawScene } = useGLTF(def.modelPath);

  const { model, scale, offset, beamOriginNode, selectionEdges, overlayPos } =
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
      const scale = def.targetHeight / size.y;

      const offset: [number, number, number] = [
        -(box.min.x + box.max.x) / 2,
        -box.min.y,
        -(box.min.z + box.max.z) / 2,
      ];

      const beamOriginNode = findBeamOriginNode(model, caps);

      const ww = size.x * scale + SELECTION_PADDING;
      const wh = def.targetHeight    + SELECTION_PADDING;
      const wd = size.z * scale + SELECTION_PADDING;
      const selectionEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(ww, wh, wd));
      const overlayPos: [number, number, number] = [ww / 2 + 0.05, wh, wd / 2 + 0.05];

      return { model, scale, offset, beamOriginNode, selectionEdges, overlayPos };
    }, [rawScene, def, caps]);

  useFrame(() => {
    for (const { cap, config } of caps) {
      cap.applyToModel?.(model, object, config, caps);
    }
  });

  const raw       = object as unknown as Record<string, unknown>;
  const rotationX = typeof raw.rotationX === "number" ? raw.rotationX : 0;
  const rotationY = typeof raw.rotationY === "number" ? raw.rotationY : 0;
  const rotationZ = typeof raw.rotationZ === "number" ? raw.rotationZ : 0;

  const beamBound = caps.find((b): b is BoundCapability & { config: BeamConfig } =>
    b.cap.type === "beam",
  );

  return (
    <>
      <group
        position={object.position}
        rotation={[rotationX * DEGREES_PER_RADIAN, rotationY * DEGREES_PER_RADIAN, rotationZ * DEGREES_PER_RADIAN]}
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

      {beamBound && (
        <BeamRenderer
          obj={object}
          config={beamBound.config}
          originNode={beamOriginNode}
          boundCaps={caps}
        />
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
