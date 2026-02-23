import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface MovingHeadProps {
  position: [number, number, number];
  pan: number;    // degrees
  tilt: number;   // degrees
  dimmer: number; // 0–1
  color: THREE.Color;
}

const BODY  = { color: "#2c2c2c", roughness: 0.55, metalness: 0.35 } as const;
const YOKE  = { color: "#1a1a1a", roughness: 0.5,  metalness: 0.45 } as const;
const AXLE  = { color: "#111111", roughness: 0.3,  metalness: 0.7  } as const;

// Shared lens emissive material — mutated in useFrame via ref
function LensMat() {
  return (
    <meshStandardMaterial
      color="#060606"
      emissive={new THREE.Color(0xffffff)}
      emissiveIntensity={0}
      roughness={0.05}
      metalness={0.1}
    />
  );
}

export function MovingHead({ position, pan, tilt, dimmer, color }: MovingHeadProps) {
  const yokeRef  = useRef<THREE.Group | null>(null);
  const headRef  = useRef<THREE.Group | null>(null);
  const beamRef  = useRef<THREE.Mesh | null>(null);
  const spotRef  = useRef<THREE.SpotLight | null>(null);
  const lensRef  = useRef<THREE.Mesh | null>(null);
  const initializedRef = useRef(false);

  // Wire SpotLight target as a child of headRef so it rotates with the head
  useEffect(() => {
    const head = headRef.current;
    const spot = spotRef.current;
    if (!head || !spot) return;

    const target = new THREE.Object3D();
    target.position.set(0, 6.3, 0); // 6 units above the lens
    head.add(target);
    spot.target = target;

    return () => { head.remove(target); };
  }, []);

  useFrame(() => {
    const lerpFactor = initializedRef.current ? 0.12 : 1;
    initializedRef.current = true;

    // ── Pan: yoke rotates around Y ──────────────────────────────────────
    if (yokeRef.current) {
      yokeRef.current.rotation.y = THREE.MathUtils.lerp(
        yokeRef.current.rotation.y,
        THREE.MathUtils.degToRad(pan),
        lerpFactor,
      );
    }

    // ── Tilt: head drum rotates around X ───────────────────────────────
    if (headRef.current) {
      headRef.current.rotation.x = THREE.MathUtils.lerp(
        headRef.current.rotation.x,
        THREE.MathUtils.degToRad(tilt),
        lerpFactor,
      );
    }

    // ── Beam cone ───────────────────────────────────────────────────────
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(color);
      mat.opacity = dimmer * 0.38;
      beamRef.current.visible = dimmer > 0.01;
    }

    // ── SpotLight ───────────────────────────────────────────────────────
    if (spotRef.current) {
      spotRef.current.color.copy(color);
      spotRef.current.intensity = dimmer * 10;
    }

    // ── Emissive lens ───────────────────────────────────────────────────
    if (lensRef.current) {
      const mat = lensRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(color);
      mat.emissiveIntensity = dimmer * 3;
    }
  });

  return (
    <group position={position}>

      {/* ── Base plate ──────────────────────────────────────────────── */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.3, 0.36, 0.1, 20]} />
        <meshStandardMaterial {...BODY} />
      </mesh>

      {/* Short riser column */}
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.14, 14]} />
        <meshStandardMaterial {...BODY} />
      </mesh>

      {/* ── Yoke (pan · Y-axis) ─────────────────────────────────────── */}
      <group ref={yokeRef} position={[0, 0.24, 0]}>

        {/* Left arm */}
        <mesh position={[-0.34, 0.52, 0]}>
          <boxGeometry args={[0.1, 1.04, 0.1]} />
          <meshStandardMaterial {...YOKE} />
        </mesh>

        {/* Right arm */}
        <mesh position={[0.34, 0.52, 0]}>
          <boxGeometry args={[0.1, 1.04, 0.1]} />
          <meshStandardMaterial {...YOKE} />
        </mesh>

        {/* ── Head drum (tilt · X-axis) ──────────────────────────────── */}
        {/* Pivot at top of arms; beam exits +Y when tilt=0 */}
        <group ref={headRef} position={[0, 1.04, 0]}>

          {/* Drum body */}
          <mesh>
            <cylinderGeometry args={[0.27, 0.27, 0.56, 24]} />
            <meshStandardMaterial {...BODY} />
          </mesh>

          {/* Rear cap (slightly darker disc) */}
          <mesh position={[0, -0.29, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
            <meshStandardMaterial color="#111" roughness={0.6} metalness={0.2} />
          </mesh>

          {/* Left axle stub */}
          <mesh position={[-0.34, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.16, 12]} />
            <meshStandardMaterial {...AXLE} />
          </mesh>

          {/* Right axle stub */}
          <mesh position={[0.34, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.16, 12]} />
            <meshStandardMaterial {...AXLE} />
          </mesh>

          {/* Lens bezel ring */}
          <mesh position={[0, 0.29, 0]}>
            <torusGeometry args={[0.19, 0.025, 8, 24]} />
            <meshStandardMaterial color="#111" metalness={0.6} roughness={0.3} />
          </mesh>

          {/* Lens glass */}
          <mesh ref={lensRef} position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.165, 0.165, 0.04, 20]} />
            <LensMat />
          </mesh>

          {/* Beam cone — tip at lens (y=0.3), opens toward +Y */}
          {/* ConeGeometry default: tip at +Y, base at −Y → flip via rotation.x=π  */}
          {/* Center at 0.3 + height/2 = 0.3 + 3.0 = 3.3 so tip lands at 0.3      */}
          <mesh ref={beamRef} position={[0, 3.3, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
            <coneGeometry args={[0.5, 6, 20, 1, true]} />
            <meshBasicMaterial
              transparent
              side={THREE.BackSide}
              depthWrite={false}
              opacity={0}
              color={0xffffff}
            />
          </mesh>

          {/* SpotLight at lens; target added imperatively in useEffect */}
          <spotLight
            ref={spotRef}
            position={[0, 0.3, 0]}
            angle={Math.PI / 10}
            penumbra={0.3}
            intensity={0}
            distance={20}
          />

        </group>
      </group>
    </group>
  );
}
