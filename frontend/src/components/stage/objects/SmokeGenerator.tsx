interface SmokeGeneratorProps {
  position: [number, number, number];
}

export function SmokeGenerator({ position }: SmokeGeneratorProps) {
  return (
    <group position={position}>
      {/* Box body */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.25]} />
        <meshStandardMaterial color="#1e1e1e" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Nozzle cylinder stub at front */}
      <mesh position={[0.22, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.05, 0.08, 10]} />
        <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Vent grille representation */}
      <mesh position={[-0.18, 0.15, 0]}>
        <boxGeometry args={[0.04, 0.2, 0.2]} />
        <meshStandardMaterial color="#111111" roughness={0.8} metalness={0.1} />
      </mesh>
    </group>
  );
}
