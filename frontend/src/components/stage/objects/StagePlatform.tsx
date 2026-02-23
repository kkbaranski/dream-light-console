interface StagePlatformProps {
  position: [number, number, number];
  width?: number;
  depth?: number;
  thickness?: number;
}

export function StagePlatform({
  position,
  width = 2,
  depth = 2,
  thickness = 0.4,
}: StagePlatformProps) {
  return (
    <group position={position}>
      {/* Main deck */}
      <mesh position={[0, thickness / 2, 0]}>
        <boxGeometry args={[width, thickness, depth]} />
        <meshStandardMaterial color="#5c3d1e" roughness={0.85} metalness={0.02} />
      </mesh>

      {/* Top edge highlight — thin strip on top face */}
      <mesh position={[0, thickness + 0.002, 0]}>
        <boxGeometry args={[width, 0.004, depth]} />
        <meshStandardMaterial color="#7a5230" roughness={0.75} metalness={0.05} />
      </mesh>
    </group>
  );
}
