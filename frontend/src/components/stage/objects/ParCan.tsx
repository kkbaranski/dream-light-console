import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParCanProps {
  position: [number, number, number];
  dimmer?: number;
  color?: THREE.Color;
}

export function ParCan({ position, dimmer = 0, color }: ParCanProps) {
  const lensRef = useRef<THREE.Mesh | null>(null);
  const beamRef = useRef<THREE.Mesh | null>(null);
  const spotRef = useRef<THREE.SpotLight | null>(null);

  const resolvedColor = color ?? new THREE.Color(1, 1, 1);

  useFrame(() => {
    if (lensRef.current) {
      const mat = lensRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(resolvedColor);
      mat.emissiveIntensity = dimmer * 3;
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(resolvedColor);
      mat.opacity = dimmer * 0.35;
      beamRef.current.visible = dimmer > 0.01;
    }
    if (spotRef.current) {
      spotRef.current.color.copy(resolvedColor);
      spotRef.current.intensity = dimmer * 8;
    }
  });

  return (
    <group position={position}>
      {/* Body cylinder */}
      <mesh>
        <cylinderGeometry args={[0.12, 0.14, 0.4, 18]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.55} metalness={0.35} />
      </mesh>

      {/* Lens top */}
      <mesh ref={lensRef} position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 18]} />
        <meshStandardMaterial
          color="#060606"
          emissive={new THREE.Color(0xffffff)}
          emissiveIntensity={0}
          roughness={0.05}
          metalness={0.1}
        />
      </mesh>

      {/* Beam cone: opens upward */}
      <mesh ref={beamRef} position={[0, 3.2, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
        <coneGeometry args={[0.7, 6, 18, 1, true]} />
        <meshBasicMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          opacity={0}
          color={0xffffff}
        />
      </mesh>

      {/* SpotLight */}
      <spotLight
        ref={spotRef}
        position={[0, 0.22, 0]}
        angle={Math.PI / 8}
        penumbra={0.4}
        intensity={0}
        distance={18}
      />
    </group>
  );
}
