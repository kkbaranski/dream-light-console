import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface LedBarProps {
  position: [number, number, number];
  length?: number;
  segments?: number;
  color?: THREE.Color;
  dimmer?: number;
}

export function LedBar({
  position,
  length = 1.5,
  segments = 5,
  color,
  dimmer = 0,
}: LedBarProps) {
  const segRefs = useRef<(THREE.Mesh | null)[]>([]);
  const resolvedColor = color ?? new THREE.Color(1, 1, 1);
  const segLen = length / segments;
  const gapFrac = 0.1;
  const segVisLen = segLen * (1 - gapFrac);

  useFrame(() => {
    segRefs.current.forEach((mesh) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(resolvedColor);
      mat.emissiveIntensity = dimmer * 4;
    });
  });

  return (
    <group position={position}>
      {/* Housing bar */}
      <mesh>
        <boxGeometry args={[length, 0.05, 0.08]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* LED segment chips */}
      {Array.from({ length: segments }, (_, i) => {
        const x = -length / 2 + (i + 0.5) * segLen;
        return (
          <mesh
            key={i}
            ref={(el) => { segRefs.current[i] = el; }}
            position={[x, 0.03, 0]}
          >
            <boxGeometry args={[segVisLen, 0.01, 0.05]} />
            <meshStandardMaterial
              color="#080808"
              emissive={new THREE.Color(0xffffff)}
              emissiveIntensity={0}
              roughness={0.05}
              metalness={0.0}
            />
          </mesh>
        );
      })}
    </group>
  );
}
