import { Suspense, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FeatureObject, BoundFeature } from "../../devices/feature";
import type { BeamConfig } from "../../devices/features/beam/beam";
import { BeamRenderer, findBeamOriginNode } from "../../devices/features/beam/beam";

function PreviewMesh({
  modelPath,
  targetHeight,
  features,
  featureObjectRef,
}: {
  modelPath: string;
  targetHeight: number;
  features: ReadonlyArray<BoundFeature>;
  featureObjectRef: MutableRefObject<FeatureObject>;
}) {
  const { scene: rawScene } = useGLTF(modelPath);

  // Use a ref so useFrame always reads the latest features without re-cloning
  // the GLTF model on every feature config change (e.g. response curve drag).
  const featuresRef = useRef(features);
  featuresRef.current = features;

  const { model, scale, offset } = useMemo(() => {
    const model = rawScene.clone(true);

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m: THREE.Material) => m.clone())
        : mesh.material.clone();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = targetHeight / size.y;

    const offset: [number, number, number] = [
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    ];

    return { model, scale, offset };
  }, [rawScene, targetHeight]);

  const beamOriginNode = useMemo(
    () => findBeamOriginNode(model, features),
    [model, features],
  );

  useFrame(() => {
    const obj = featureObjectRef.current;
    const currentFeatures = featuresRef.current;
    for (const { feature, config } of currentFeatures) {
      feature.applyToModel?.(model, obj, config, currentFeatures);
    }
  });

  const beamBound = features.find(
    (b): b is BoundFeature & { config: BeamConfig } => b.feature.type === "beam",
  );

  return (
    <>
      <group scale={scale}>
        <primitive object={model} position={offset} />
      </group>

      {beamBound && (
        <BeamRenderer
          obj={featureObjectRef.current}
          config={beamBound.config}
          originNode={beamOriginNode}
          boundFeatures={features}
        />
      )}
    </>
  );
}

export function FixturePreview3D({
  modelPath,
  targetHeight,
  features,
  featureObjectRef,
}: {
  modelPath: string;
  targetHeight: number;
  features: ReadonlyArray<BoundFeature>;
  featureObjectRef: MutableRefObject<FeatureObject>;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [1, 1, 3], fov: 25 }}
      gl={{ antialias: true, localClippingEnabled: true, toneMapping: THREE.AgXToneMapping }}
      style={{ background: "#1f2937" }}
      onCreated={({ scene }) => { scene.environmentIntensity = 0.17; }}
    >
      <Environment preset="studio" />

      <Suspense fallback={null}>
        <PreviewMesh
          modelPath={modelPath}
          targetHeight={targetHeight}
          features={features}
          featureObjectRef={featureObjectRef}
        />
      </Suspense>

      <OrbitControls
        target={[0, targetHeight / 2, 0]}
        enablePan={false}
        minDistance={1}
        maxDistance={8}
      />
    </Canvas>
  );
}
