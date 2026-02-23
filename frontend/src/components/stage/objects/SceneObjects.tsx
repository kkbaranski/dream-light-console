import { Suspense, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useStage3DStore } from "../../../store/stage3dStore";
import { useDMXStore } from "../../../store/dmxStore";
import { getFixtureDef } from "../../../fixtures/registry";
import { findCapability } from "../../../fixtures/types";
import { MovingHead } from "../MovingHead";
import { ParCan } from "./ParCan";
import { StagePlatform } from "./StagePlatform";
import { TrussBeam } from "./TrussBeam";
import { LedBar } from "./LedBar";
import { SmokeGenerator } from "./SmokeGenerator";
import type { Stage3DObject } from "../../../store/stage3dStore";

function MovingHeadObject({ obj }: { obj: Stage3DObject }) {
  const channels = useDMXStore((s) => s.channels);
  const sc = obj.startChannel ?? 1;
  const def = getFixtureDef(obj.fixtureType ?? "moving_head");
  const panCap = findCapability(def.capabilities, "pan");
  const tiltCap = findCapability(def.capabilities, "tilt");
  const dimmerCap = findCapability(def.capabilities, "dimmer");
  const rgbCap = findCapability(def.capabilities, "rgb");

  const pan = panCap
    ? (channels[sc - 1 + panCap.offset] / 255) * 540 - 270
    : 0;
  const tilt = tiltCap
    ? (channels[sc - 1 + tiltCap.offset] / 255) * 270 - 135
    : 0;
  const dimmer = dimmerCap ? channels[sc - 1 + dimmerCap.offset] / 255 : 0;

  const color = useMemo(() => {
    if (rgbCap) {
      return new THREE.Color(
        channels[sc - 1 + rgbCap.offsetR] / 255,
        channels[sc - 1 + rgbCap.offsetG] / 255,
        channels[sc - 1 + rgbCap.offsetB] / 255,
      );
    }
    return new THREE.Color(1, 1, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rgbCap,
    sc,
    rgbCap ? channels[sc - 1 + rgbCap.offsetR] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetG] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetB] : 0,
  ]);

  return (
    <Suspense fallback={null}>
      <MovingHead
        position={obj.position}
        pan={pan}
        tilt={tilt}
        dimmer={dimmer}
        color={color}
      />
    </Suspense>
  );
}

function ParCanObject({ obj }: { obj: Stage3DObject }) {
  const channels = useDMXStore((s) => s.channels);
  const sc = obj.startChannel ?? 1;
  const def = getFixtureDef(obj.fixtureType ?? "generic");
  const dimmerCap = findCapability(def.capabilities, "dimmer");
  const rgbCap = findCapability(def.capabilities, "rgb");

  const dimmer = dimmerCap ? channels[sc - 1 + dimmerCap.offset] / 255 : 0;
  const color = useMemo(() => {
    if (rgbCap) {
      return new THREE.Color(
        channels[sc - 1 + rgbCap.offsetR] / 255,
        channels[sc - 1 + rgbCap.offsetG] / 255,
        channels[sc - 1 + rgbCap.offsetB] / 255,
      );
    }
    return new THREE.Color(1, 1, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rgbCap,
    sc,
    rgbCap ? channels[sc - 1 + rgbCap.offsetR] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetG] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetB] : 0,
  ]);

  return <ParCan position={obj.position} dimmer={dimmer} color={color} />;
}

function LedBarObject({ obj }: { obj: Stage3DObject }) {
  const channels = useDMXStore((s) => s.channels);
  const sc = obj.startChannel ?? 1;
  const def = getFixtureDef(obj.fixtureType ?? "rgb");
  const dimmerCap = findCapability(def.capabilities, "dimmer");
  const rgbCap = findCapability(def.capabilities, "rgb");

  const dimmer = dimmerCap ? channels[sc - 1 + dimmerCap.offset] / 255 : 0;
  const color = useMemo(() => {
    if (rgbCap) {
      return new THREE.Color(
        channels[sc - 1 + rgbCap.offsetR] / 255,
        channels[sc - 1 + rgbCap.offsetG] / 255,
        channels[sc - 1 + rgbCap.offsetB] / 255,
      );
    }
    return new THREE.Color(1, 1, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rgbCap,
    sc,
    rgbCap ? channels[sc - 1 + rgbCap.offsetR] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetG] : 0,
    rgbCap ? channels[sc - 1 + rgbCap.offsetB] : 0,
  ]);

  return (
    <LedBar
      position={obj.position}
      length={obj.length}
      segments={obj.segments}
      color={color}
      dimmer={dimmer}
    />
  );
}

/** Wireframe box shown around the selected object */
function SelectionBox({ size }: { size: [number, number, number] }) {
  return (
    <mesh>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.7} />
    </mesh>
  );
}

/** Wireframe box at a world position */
function SelectionWire({
  position,
  size,
}: {
  position: [number, number, number];
  size: [number, number, number];
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.7} />
    </mesh>
  );
}

export function SceneObjects() {
  const objects = useStage3DStore((s) => s.objects);
  const selectedObjectId = useStage3DStore((s) => s.selectedObjectId);
  const selectObject = useStage3DStore((s) => s.selectObject);

  function handleClick(e: ThreeEvent<MouseEvent>, id: string) {
    e.stopPropagation();
    selectObject(id);
  }

  return (
    <>
      {objects.map((obj) => {
        const selected = obj.id === selectedObjectId;
        const sel = (e: ThreeEvent<MouseEvent>) => handleClick(e, obj.id);
        const p = obj.position;

        switch (obj.type) {
          case "moving_head":
            return (
              <group key={obj.id} onClick={sel}>
                <MovingHeadObject obj={obj} />
                {selected && <SelectionWire position={[p[0], p[1] + 0.75, p[2]]} size={[0.8, 1.5, 0.8]} />}
              </group>
            );
          case "par_can":
            return (
              <group key={obj.id} onClick={sel}>
                <ParCanObject obj={obj} />
                {selected && <SelectionWire position={[p[0], p[1] + 0.25, p[2]]} size={[0.35, 0.5, 0.35]} />}
              </group>
            );
          case "led_bar":
            return (
              <group key={obj.id} onClick={sel}>
                <LedBarObject obj={obj} />
                {selected && (
                  <SelectionWire
                    position={[p[0], p[1] + 0.03, p[2]]}
                    size={[obj.length ?? 1.5, 0.12, 0.15]}
                  />
                )}
              </group>
            );
          case "stage_platform": {
            const t = obj.thickness ?? 0.4;
            return (
              <group key={obj.id} onClick={sel}>
                <StagePlatform
                  position={obj.position}
                  width={obj.width}
                  depth={obj.depth}
                  thickness={obj.thickness}
                />
                {selected && (
                  <SelectionWire
                    position={[p[0], p[1] + t / 2, p[2]]}
                    size={[obj.width ?? 2, t, obj.depth ?? 2]}
                  />
                )}
              </group>
            );
          }
          case "truss_beam":
            return (
              <group key={obj.id} onClick={sel}>
                <TrussBeam position={obj.position} length={obj.length} />
                {selected && (
                  <SelectionWire
                    position={p}
                    size={[obj.length ?? 3, 0.28, 0.28]}
                  />
                )}
              </group>
            );
          case "smoke_machine":
            return (
              <group key={obj.id} onClick={sel}>
                <SmokeGenerator position={obj.position} />
                {selected && <SelectionWire position={[p[0], p[1] + 0.15, p[2]]} size={[0.5, 0.38, 0.3]} />}
              </group>
            );
        }
      })}
    </>
  );
}
