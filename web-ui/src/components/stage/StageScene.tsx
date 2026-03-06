import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture, Environment } from "@react-three/drei";
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
import { PlacedObjects } from "./PlacedObjects";
import { BACKGROUND_COLOR } from "./sceneConstants";
import { DEVICE_REGISTRY } from "../../devices/registry";


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
      <Environment preset="studio" environmentIntensity={0.17} />
      <hemisphereLight args={["#4a6080", "#101318", 0.9]} />
      <directionalLight position={[6, 12, 8]} intensity={1.4} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight position={[-5, 5, -6]} intensity={0.35} color="#7090bb" />
      <directionalLight position={[0, 10, 20]} intensity={0.8} />

      {/* Stage floor — box centered at Y=-0.5 so the top face lands exactly at Y=0 */}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ isFloor: true }} receiveShadow>
        <boxGeometry args={[70, 150, 1]} />
        <MeshMaterial
          id={floorMaterialId}
          registry={floorMaterials}
          fallbackColor="#1a1a1a"
          worldSize={[70, 150]}
          tileSize={floorTileSize}
        />
      </mesh>

      {/* Infinite back wall */}
      <mesh position={[0, 19.5, -75]} userData={{ isWall: true }} receiveShadow>
        <boxGeometry args={[70, 40]} />
        <MeshMaterial
          id={wallMaterialId}
          registry={wallMaterials}
          fallbackColor="white"
          worldSize={[70, 40]}
          tileSize={wallTileSize}
        />
      </mesh>

      {stageDefinition && <StageModel path={stageDefinition.path} />}

      <PlacedObjects />
    </>
  );
}

export function StageScene() {
  const cameraRef = useRef<THREE.Camera | null>(null);
  const sceneRef  = useRef<THREE.Scene | null>(null);
  const addObject = useStageEditorStore((state) => state.addObject);
  const clearSelection = useStageEditorStore((state) => state.clearSelection);
  const copySelected = useStageEditorStore((state) => state.copySelected);
  const paste = useStageEditorStore((state) => state.paste);
  const removeObjects = useStageEditorStore((state) => state.removeObjects);
  const undo = useStageEditorStore((state) => state.undo);
  const redo = useStageEditorStore((state) => state.redo);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      const isTextInput =
        (event.target instanceof HTMLInputElement && event.target.type !== "range") ||
        event.target instanceof HTMLTextAreaElement;

      if (!isTextInput) {
        if (isMod && event.key === "c") copySelected();
        if (isMod && event.key === "v") paste();
        if (event.key === "Backspace" || event.key === "Delete") {
          const { selectedIds } = useStageEditorStore.getState();
          if (selectedIds.length > 0) {
            event.preventDefault();
            removeObjects(selectedIds);
          }
        }
      }

      if (isMod && !event.shiftKey && event.key === "z") {
        event.preventDefault();
        undo();
      }
      if (isMod && event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelected, paste, removeObjects, undo, redo]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const deviceType = event.dataTransfer.getData("dlc/device-type");
    if (!deviceType || !(deviceType in DEVICE_REGISTRY) || !cameraRef.current || !sceneRef.current) return;

    const fixtureId = event.dataTransfer.getData("dlc/fixture-id") || undefined;
    const fixtureName = event.dataTransfer.getData("dlc/fixture-name") || undefined;
    const fixtureMode = event.dataTransfer.getData("dlc/fixture-mode") || undefined;

    // Guard: don't place the same physical fixture twice
    if (fixtureId && useStageEditorStore.getState().objects.some((o) => o.fixtureId === fixtureId)) return;

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
      .filter((hit) => !hit.object.userData.isBeam && !hit.object.userData.isProp);
    const firstHit = hits[0];
    if (!firstHit?.object.userData.isFloor) return;

    const position: [number, number, number] = [floorPoint.x, 0, floorPoint.z];
    addObject({ id: crypto.randomUUID(), type: deviceType as import("../../scene/types").SceneObjectType, position, fixtureId, fixtureName, fixtureMode });
  }

  return (
    <div
      className="flex-1 relative overflow-hidden"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [0, 7, 38], fov: 50 }}
        shadows
        gl={{ antialias: true, localClippingEnabled: true, toneMapping: THREE.AgXToneMapping }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(BACKGROUND_COLOR);
        }}
        onPointerMissed={() => clearSelection()}
      >
        <CameraCapture cameraRef={cameraRef} />
        <SceneCapture sceneRef={sceneRef} />
        <SceneContent />
        <OrbitControls
          makeDefault
          enableDamping
          minDistance={10}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2 - 0.1}
          screenSpacePanning={false}
        />
      </Canvas>
    </div>
  );
}
