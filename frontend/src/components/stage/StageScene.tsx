import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useStageEditorStore } from "../../store/stageEditorStore";
import {
  floorMaterials,
  wallMaterials,
  findMaterial,
  type TextureMaterial,
  type SolidMaterial,
} from "../../materials/registry";
import { findStageDefinition } from "../../stages/registry";
import { StageModel } from "./StageModel";
import { PlacedLights } from "./PlacedLights";
import { WALL_Z, BACKGROUND_COLOR } from "./sceneConstants";

// ---------------------------------------------------------------------------
// Camera constraint — limits horizontal orbit so the camera stays at least
// 2 m in front of the back wall (prevents clipping and back-face peeking).
// ---------------------------------------------------------------------------
function WallCameraConstraint() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as {
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
  } | null;

  useFrame(() => {
    if (!controls) return;

    const horizontalRadius = Math.sqrt(
      camera.position.x ** 2 + camera.position.z ** 2,
    );

    if (horizontalRadius < 0.01) return;

    const cosMaxAzimuth = (WALL_Z + 2) / horizontalRadius;

    if (cosMaxAzimuth < -1) {
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    } else {
      const maxAzimuth = Math.acos(cosMaxAzimuth);
      controls.minAzimuthAngle = -maxAzimuth;
      controls.maxAzimuthAngle = maxAzimuth;
    }
  });

  return null;
}

// Writes the current camera into a ref so the drag-drop handler (a DOM event,
// outside the Canvas) can use it for raycasting without going through state.
function CameraCapture({
  cameraRef,
}: {
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}) {
  cameraRef.current = useThree((state) => state.camera);
  return null;
}

function SceneCapture({
  sceneRef,
}: {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
}) {
  sceneRef.current = useThree((state) => state.scene);
  return null;
}

// ---------------------------------------------------------------------------
// PBR texture loading
// ---------------------------------------------------------------------------
function TexturedMeshMaterial({
  material,
  worldSize,
  tileSize,
}: {
  material: TextureMaterial;
  worldSize: [number, number];
  tileSize: number;
}) {
  const [worldWidth, worldHeight] = worldSize;

  const textures = useTexture({
    map:          `${material.basePath}diff.jpg`,
    normalMap:    `${material.basePath}nor.jpg`,
    roughnessMap: `${material.basePath}rough.jpg`,
    aoMap:        `${material.basePath}ao.jpg`,
  });

  useEffect(() => {
    const repeatX = worldWidth / (material.repeat * tileSize);
    const repeatY = worldHeight / (material.repeat * tileSize);

    for (const texture of Object.values(textures)) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.needsUpdate = true;
    }
  }, [textures, worldWidth, worldHeight, material.repeat, tileSize]);

  return <meshStandardMaterial {...textures} side={THREE.DoubleSide} />;
}

class TextureErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Texture loading failed:", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SolidMeshMaterial({ material }: { material: SolidMaterial }) {
  return (
    <meshStandardMaterial
      color={material.color}
      roughness={material.roughness}
      metalness={material.metalness}
      side={THREE.DoubleSide}
    />
  );
}

function MeshMaterial({
  id,
  registry,
  fallbackColor,
  worldSize,
  tileSize,
}: {
  id: string;
  registry: typeof floorMaterials;
  fallbackColor: string;
  worldSize: [number, number];
  tileSize: number;
}) {
  const material = findMaterial(registry, id);
  const solidFallback = <meshStandardMaterial color={fallbackColor} side={THREE.DoubleSide} />;

  if (material.kind === "solid") {
    return <SolidMeshMaterial material={material} />;
  }

  return (
    <TextureErrorBoundary key={material.id} fallback={solidFallback}>
      <Suspense fallback={solidFallback}>
        <TexturedMeshMaterial
          material={material}
          worldSize={worldSize}
          tileSize={tileSize}
        />
      </Suspense>
    </TextureErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Scene geometry
// ---------------------------------------------------------------------------
function SceneContent() {
  const floorMaterialId = useStageEditorStore((state) => state.floorMaterialId);
  const wallMaterialId = useStageEditorStore((state) => state.wallMaterialId);
  const floorTileSize = useStageEditorStore((state) => state.floorTileSize);
  const wallTileSize = useStageEditorStore((state) => state.wallTileSize);
  const stageModelId = useStageEditorStore((state) => state.stageModelId);
  const stageDefinition = stageModelId ? findStageDefinition(stageModelId) : null;

  return (
    <>
      <hemisphereLight args={["#4a6080", "#101318", 0.9]} />
      <directionalLight position={[6, 12, 8]} intensity={1.4} />
      <directionalLight position={[-5, 5, -6]} intensity={0.35} color="#7090bb" />
      <directionalLight position={[0, 10, 20]} intensity={0.8} />

      {/* Stage floor — tagged so drop handler can verify the ray hit empty floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ isFloor: true }}>
        <planeGeometry args={[200, 400]} />
        <MeshMaterial
          id={floorMaterialId}
          registry={floorMaterials}
          fallbackColor="#1a1a1a"
          worldSize={[200, 400]}
          tileSize={floorTileSize}
        />
      </mesh>

      {/* Infinite back wall */}
      <mesh position={[0, 30, WALL_Z]}>
        <planeGeometry args={[200, 200]} />
        <MeshMaterial
          id={wallMaterialId}
          registry={wallMaterials}
          fallbackColor="white"
          worldSize={[200, 200]}
          tileSize={wallTileSize}
        />
      </mesh>

      {stageDefinition && <StageModel path={stageDefinition.path} />}

      <PlacedLights />

      <WallCameraConstraint />
    </>
  );
}

export function StageScene() {
  const cameraRef = useRef<THREE.Camera | null>(null);
  const sceneRef  = useRef<THREE.Scene | null>(null);
  const addLight = useStageEditorStore((state) => state.addLight);
  const setSelectedLight = useStageEditorStore((state) => state.setSelectedLight);
  const copySelectedLights = useStageEditorStore((state) => state.copySelectedLights);
  const pasteLights = useStageEditorStore((state) => state.pasteLights);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key === "c") copySelectedLights();
      if (isMod && event.key === "v") pasteLights();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelectedLights, pasteLights]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const lightType = event.dataTransfer.getData("dlc/light-type");
    if (!lightType || !cameraRef.current || !sceneRef.current) return;

    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current);

    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const floorPoint = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, floorPoint)) return;

    const topDown = new THREE.Raycaster(
      new THREE.Vector3(floorPoint.x, 100, floorPoint.z),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = topDown
      .intersectObjects(sceneRef.current.children, true)
      .filter((hit) => !hit.object.userData.isBeam);
    const firstHit = hits[0];
    if (!firstHit?.object.userData.isFloor) return;

    addLight({
      id: crypto.randomUUID(),
      type: lightType as "moving_head",
      position: [floorPoint.x, 0, floorPoint.z],
    });
  }

  return (
    <div
      className="flex-1 relative overflow-hidden"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [10, 12, 16], fov: 40 }}
        gl={{ antialias: true }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(BACKGROUND_COLOR);
        }}
        onPointerMissed={() => setSelectedLight(null)}
      >
        <CameraCapture cameraRef={cameraRef} />
        <SceneCapture sceneRef={sceneRef} />
        <SceneContent />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.06}
          enablePan={false}
          minDistance={40}
          maxDistance={100}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
      </Canvas>
    </div>
  );
}
