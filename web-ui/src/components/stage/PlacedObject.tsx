import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import type { SceneObject } from "../../scene/types";
import { useObjectDrag } from "../../hooks/useObjectDrag";
import { DEVICE_REGISTRY, activeFeatures, applyFixtureConfig } from "../../devices/registry";
import { DEG2RAD, type BoundFeature } from "../../devices/feature";
import type { BeamConfig } from "../../devices/features/beam/beam";
import { BeamRenderer, findBeamOriginNode } from "../../devices/features/beam/beam";
import { useFixtures } from "../../api/hooks";

for (const def of Object.values(DEVICE_REGISTRY)) {
  useGLTF.preload(def.modelPath);
}

const SELECTION_PADDING = 0.1;

function PlacedObjectMesh({ object }: { object: SceneObject }) {
  const def        = DEVICE_REGISTRY[object.type];
  const isSelected = useStageEditorStore((state) => state.selectedIds.includes(object.id));
  const baseFeatures = activeFeatures(def, object.mode);

  // Resolve fixture-specific overrides from live API data.
  const fixtureConfigJson = useFixtures().data?.find(f => f.id === object.fixtureId)?.config_json;
  const resolvedFeatures = useMemo(() => {
    if (!fixtureConfigJson) return baseFeatures;
    try { return applyFixtureConfig(baseFeatures, JSON.parse(fixtureConfigJson)); }
    catch { return baseFeatures; }
  }, [baseFeatures, fixtureConfigJson]);

  // Keep a ref so useFrame always reads the latest resolved features
  // without causing the model-cloning useMemo to re-run.
  const featuresRef = useRef(resolvedFeatures);
  featuresRef.current = resolvedFeatures;

  const { handlePointerDown, coordsVisible, coordsOpacity } = useObjectDrag(
    object,
    { supportsGroupDrag: def.supportsGroupDrag, supportsAdditiveSelect: def.supportsAdditiveSelect },
    {
      onDragStart: () => useStageEditorStore.getState()._pauseHistory(),
      onDragEnd:   () => useStageEditorStore.getState()._resumeHistory(),
    },
  );

  const { scene: rawScene } = useGLTF(def.modelPath);

  // Model cloning only depends on baseFeatures (stable, WeakMap-cached).
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

      const beamOriginNode = findBeamOriginNode(model, baseFeatures);

      const selectionWidth  = size.x * scale + SELECTION_PADDING;
      const selectionHeight = def.targetHeight    + SELECTION_PADDING;
      const selectionDepth  = size.z * scale + SELECTION_PADDING;
      const selectionEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(selectionWidth, selectionHeight, selectionDepth));
      const overlayPos: [number, number, number] = [selectionWidth / 2 + 0.05, selectionHeight, selectionDepth / 2 + 0.05];

      return { model, scale, offset, beamOriginNode, selectionEdges, overlayPos };
    }, [rawScene, def, baseFeatures]);

  useEffect(() => () => { selectionEdges.dispose(); }, [selectionEdges]);

  useFrame(() => {
    const features = featuresRef.current;
    for (const { feature, config } of features) {
      feature.applyToModel?.(model, object, config, features);
    }
  });

  const raw       = object as unknown as Record<string, unknown>;
  const rotationX = typeof raw.rotationX === "number" ? raw.rotationX : 0;
  const rotationY = typeof raw.rotationY === "number" ? raw.rotationY : 0;
  const rotationZ = typeof raw.rotationZ === "number" ? raw.rotationZ : 0;

  const beamBound = resolvedFeatures.find((b): b is BoundFeature & { config: BeamConfig } =>
    b.feature.type === "beam",
  );

  return (
    <>
      <group
        position={object.position}
        rotation={[rotationX * DEG2RAD, rotationY * DEG2RAD, rotationZ * DEG2RAD]}
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
          boundFeatures={resolvedFeatures}
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
