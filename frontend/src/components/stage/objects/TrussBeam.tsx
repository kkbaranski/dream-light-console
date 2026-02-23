interface TrussBeamProps {
  position: [number, number, number];
  length?: number;
}

export function TrussBeam({ position, length = 3 }: TrussBeamProps) {
  // Two rails offset in Y, diagonal braces every 0.5m
  const railMat = { color: "#aaaaaa", roughness: 0.3, metalness: 0.7 } as const;
  const braceMat = { color: "#888888", roughness: 0.4, metalness: 0.6 } as const;
  const r = 0.03;

  const numSegments = Math.max(1, Math.floor(length / 0.5));
  const segLen = length / numSegments;
  const braces: number[] = Array.from({ length: numSegments + 1 }, (_, i) => i);

  return (
    <group position={position}>
      {/* Top rail */}
      <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, length, 8]} />
        <meshStandardMaterial {...railMat} />
      </mesh>

      {/* Bottom rail */}
      <mesh position={[0, -0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, length, 8]} />
        <meshStandardMaterial {...railMat} />
      </mesh>

      {/* Vertical braces at each segment boundary */}
      {braces.map((i) => {
        const x = -length / 2 + i * segLen;
        return (
          <mesh key={i} position={[x, 0, 0]}>
            <cylinderGeometry args={[r * 0.75, r * 0.75, 0.2, 6]} />
            <meshStandardMaterial {...braceMat} />
          </mesh>
        );
      })}

      {/* Diagonal cross-braces per segment */}
      {Array.from({ length: numSegments }, (_, i) => {
        const x0 = -length / 2 + i * segLen;
        const x1 = x0 + segLen;
        const cx = (x0 + x1) / 2;
        const diagLen = Math.sqrt(segLen * segLen + 0.04);
        const angle = Math.atan2(0.2, segLen);
        return (
          <mesh key={`d${i}`} position={[cx, 0, 0]} rotation={[0, 0, angle]}>
            <cylinderGeometry args={[r * 0.6, r * 0.6, diagLen, 5]} />
            <meshStandardMaterial {...braceMat} />
          </mesh>
        );
      })}
    </group>
  );
}
