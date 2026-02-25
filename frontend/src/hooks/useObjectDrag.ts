import { useEffect, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useStageEditorStore } from "../store/stageEditorStore";
import type { SceneObject } from "../scene/types";

const DRAG_THRESHOLD_SQUARED = 25;

interface DragCallbacks {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface DragOptions {
  supportsGroupDrag: boolean;
  supportsAdditiveSelect: boolean;
}

// ── Position validation ───────────────────────────────────────────────────────

// Walk up the ancestor chain to check if a mesh belongs to a placed scene object.
function hasPlacedObjectAncestor(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData.placedObjectId) return true;
    node = node.parent;
  }
  return false;
}

// Returns true if a downward ray from high above (x, z) hits anything other than
// the wall as its first solid surface. Stage model hits are allowed (objects can
// coexist with the stage footprint). Only the wall and "nothing" (off-floor edge)
// are treated as blockers.
function isValidPosition(scene: THREE.Scene, x: number, z: number): boolean {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 100, z),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (hit.object.userData.isBeam) continue;
    if (hasPlacedObjectAncestor(hit.object)) continue;
    // First non-filtered hit determines validity: the wall blocks, everything else
    // (floor, stage model surfaces) allows movement.
    return !hit.object.userData.isWall;
  }
  return false; // nothing below = off floor boundary
}

// Try the full XZ move; if blocked, attempt axis-aligned sliding by keeping the
// current object position for whichever axis is the blocker.
function resolvePosition(
  scene: THREE.Scene,
  desired: [number, number, number],
  currentX: number,
  currentZ: number,
): [number, number, number] | null {
  // Full move
  if (isValidPosition(scene, desired[0], desired[2])) return desired;
  // Slide along Z: keep current Z, apply desired X
  const xOnly: [number, number, number] = [desired[0], desired[1], currentZ];
  if (isValidPosition(scene, xOnly[0], xOnly[2])) return xOnly;
  // Slide along X: keep current X, apply desired Z
  const zOnly: [number, number, number] = [currentX, desired[1], desired[2]];
  if (isValidPosition(scene, zOnly[0], zOnly[2])) return zOnly;
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useObjectDrag(
  object: SceneObject,
  options: DragOptions,
  callbacks?: DragCallbacks,
) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const controls = useThree((state) => state.controls as { enabled: boolean } | null);

  const moveObjects = useStageEditorStore((state) => state.moveObjects);
  const setSelected = useStageEditorStore((state) => state.setSelected);
  const addToSelection = useStageEditorStore((state) => state.addToSelection);
  const toggleSelected = useStageEditorStore((state) => state.toggleSelected);

  const capturedPointerId = useRef<number | null>(null);
  const pointerDownScreen = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const isAdditive = useRef(false);
  const wasSelected = useRef(false);
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const primaryInitialPosition = useRef<[number, number, number]>([0, 0, 0]);
  const groupSnapshot = useRef(new Map<string, [number, number, number]>());

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sceneRef = useRef(scene);
  sceneRef.current = scene;

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

        const { objects, selectedIds } = useStageEditorStore.getState();
        primaryInitialPosition.current =
          objects.find((o) => o.id === object.id)?.position ??
          ([...object.position] as [number, number, number]);

        groupSnapshot.current.clear();
        if (optionsRef.current.supportsGroupDrag) {
          for (const selectedId of selectedIds) {
            if (selectedId === object.id) continue;
            const peer = objects.find((o) => o.id === selectedId);
            if (peer) {
              groupSnapshot.current.set(selectedId, [...peer.position] as [number, number, number]);
            }
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

      const desired: [number, number, number] = [
        hit.x - dragOffset.current.x,
        Math.max(0, hit.y - dragOffset.current.y),
        hit.z - dragOffset.current.z,
      ];

      // Read the current store position for sliding fallback (last successfully
      // applied position, updated every frame on valid moves).
      const currentObjects = useStageEditorStore.getState().objects;
      const currentPrimary =
        currentObjects.find((o) => o.id === object.id)?.position ??
        primaryInitialPosition.current;

      const resolvedPrimary = resolvePosition(
        sceneRef.current,
        desired,
        currentPrimary[0],
        currentPrimary[2],
      );
      if (!resolvedPrimary) return;

      // Compute the net delta from drag-start so group members move identically.
      const deltaX = resolvedPrimary[0] - primaryInitialPosition.current[0];
      const deltaY = resolvedPrimary[1] - primaryInitialPosition.current[1];
      const deltaZ = resolvedPrimary[2] - primaryInitialPosition.current[2];

      const movements: { id: string; position: [number, number, number] }[] = [
        { id: object.id, position: resolvedPrimary },
      ];

      if (optionsRef.current.supportsGroupDrag) {
        for (const [peerId, initialPos] of groupSnapshot.current) {
          const peerPosition: [number, number, number] = [
            initialPos[0] + deltaX,
            Math.max(0, initialPos[1] + deltaY),
            initialPos[2] + deltaZ,
          ];
          // Each group member is independently validated so a member already near
          // a wall is not forcibly pushed through it.
          if (isValidPosition(sceneRef.current, peerPosition[0], peerPosition[2])) {
            movements.push({ id: peerId, position: peerPosition });
          }
        }
      }

      moveObjects(movements);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== capturedPointerId.current) return;

      if (!isDragging.current) {
        if (optionsRef.current.supportsAdditiveSelect && isAdditive.current) {
          if (wasSelected.current) toggleSelected(object.id);
        } else {
          setSelected(object.id);
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
  }, [camera, controls, gl.domElement, object.id, moveObjects, setSelected, toggleSelected]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();

    const additive =
      optionsRef.current.supportsAdditiveSelect &&
      (event.nativeEvent.metaKey || event.nativeEvent.ctrlKey || event.nativeEvent.shiftKey);

    isAdditive.current = additive;
    wasSelected.current = useStageEditorStore.getState().selectedIds.includes(object.id);

    if (additive) {
      addToSelection(object.id);
    } else if (!wasSelected.current) {
      setSelected(object.id);
    }

    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    dragPlane.current.setFromNormalAndCoplanarPoint(cameraForward.negate(), event.point);
    dragOffset.current.set(
      event.point.x - object.position[0],
      event.point.y - object.position[1],
      event.point.z - object.position[2],
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
