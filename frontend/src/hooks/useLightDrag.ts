import { useEffect, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore, type PlacedLight } from "../store/stageEditorStore";

const DRAG_THRESHOLD_SQUARED = 25;

interface DragCallbacks {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useLightDrag(light: PlacedLight, callbacks?: DragCallbacks) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls as { enabled: boolean } | null);

  const moveLights = useStageEditorStore((state) => state.moveLights);
  const setSelectedLight = useStageEditorStore((state) => state.setSelectedLight);
  const addToSelection = useStageEditorStore((state) => state.addToSelection);
  const toggleSelectedLight = useStageEditorStore((state) => state.toggleSelectedLight);

  const capturedPointerId = useRef<number | null>(null);
  const pointerDownScreen = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const isAdditive = useRef(false);
  const wasSelected = useRef(false);
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const primaryInitialPosition = useRef<[number, number, number]>([0, 0, 0]);
  const groupSnapshot = useRef(new Map<string, [number, number, number]>());

  // Keep callbacks in a ref so the effect closure always calls the latest version.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const canvas = gl.domElement;

    function onPointerMove(event: PointerEvent) {
      if (capturedPointerId.current !== event.pointerId) return;

      if (!isDragging.current) {
        if (!pointerDownScreen.current) return;
        const dx = event.clientX - pointerDownScreen.current.x;
        const dy = event.clientY - pointerDownScreen.current.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_SQUARED) return;

        isDragging.current = true;
        callbacksRef.current?.onDragStart?.();

        const { placedLights, selectedLightIds } = useStageEditorStore.getState();
        primaryInitialPosition.current =
          placedLights.find((l) => l.id === light.id)?.position ??
          ([...light.position] as [number, number, number]);
        groupSnapshot.current.clear();
        for (const lightId of selectedLightIds) {
          if (lightId === light.id) continue;
          const groupLight = placedLights.find((l) => l.id === lightId);
          if (groupLight) {
            groupSnapshot.current.set(lightId, [...groupLight.position] as [number, number, number]);
          }
        }
      }

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(dragPlane.current, hit)) return;

      const primaryNewPosition: [number, number, number] = [
        hit.x - dragOffset.current.x,
        Math.max(0, hit.y - dragOffset.current.y),
        hit.z - dragOffset.current.z,
      ];

      const deltaX = primaryNewPosition[0] - primaryInitialPosition.current[0];
      const deltaY = primaryNewPosition[1] - primaryInitialPosition.current[1];
      const deltaZ = primaryNewPosition[2] - primaryInitialPosition.current[2];

      const movements: { id: string; position: [number, number, number] }[] = [
        { id: light.id, position: primaryNewPosition },
      ];

      for (const [groupLightId, initialPos] of groupSnapshot.current) {
        movements.push({
          id: groupLightId,
          position: [
            initialPos[0] + deltaX,
            Math.max(0, initialPos[1] + deltaY),
            initialPos[2] + deltaZ,
          ],
        });
      }

      moveLights(movements);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== capturedPointerId.current) return;

      if (!isDragging.current) {
        if (isAdditive.current) {
          if (wasSelected.current) toggleSelectedLight(light.id);
        } else {
          setSelectedLight(light.id);
        }
      } else {
        callbacksRef.current?.onDragEnd?.();
      }

      isDragging.current = false;
      capturedPointerId.current = null;
      pointerDownScreen.current = null;
      if (controls) controls.enabled = true;
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, controls, gl.domElement, light.id, moveLights, setSelectedLight, toggleSelectedLight]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();

    const additive =
      event.nativeEvent.metaKey ||
      event.nativeEvent.ctrlKey ||
      event.nativeEvent.shiftKey;

    isAdditive.current = additive;
    wasSelected.current = useStageEditorStore.getState().selectedLightIds.includes(light.id);

    if (additive) {
      addToSelection(light.id);
    } else if (!wasSelected.current) {
      setSelectedLight(light.id);
    }

    // Camera-facing plane through the hit point preserves the exact offset from
    // the cursor to the light in all three axes, enabling natural movement at any
    // camera angle (side view → Y/Z, top view → X/Z, angled → all three).
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    dragPlane.current.setFromNormalAndCoplanarPoint(cameraForward.negate(), event.point);
    dragOffset.current.set(
      event.point.x - light.position[0],
      event.point.y - light.position[1],
      event.point.z - light.position[2],
    );

    capturedPointerId.current = event.nativeEvent.pointerId;
    pointerDownScreen.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
    gl.domElement.setPointerCapture(event.nativeEvent.pointerId);
    if (controls) controls.enabled = false;
  }

  return { handlePointerDown };
}
