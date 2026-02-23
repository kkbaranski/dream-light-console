import { useRef } from "react";
import { useDMXStore } from "../../store/dmxStore";
import { useStageStore } from "../../store/stageStore";
import { FixtureNode } from "./FixtureNode";

const GRID_LINES = [25, 50, 75];

interface StageCanvasProps {
  onAddFixture: (x: number, y: number) => void;
}

export function StageCanvas({ onAddFixture }: StageCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fixtures = useStageStore((s) => s.fixtures);
  const selectedFixtureId = useStageStore((s) => s.selectedFixtureId);
  const setSelectedFixtureId = useStageStore((s) => s.setSelectedFixtureId);
  const patchFixture = useStageStore((s) => s.patchFixture);
  const updateFixtureLocal = useStageStore((s) => s.updateFixtureLocal);
  const channels = useDMXStore((s) => s.channels);

  function handleDragEnd(id: number, x: number, y: number) {
    void patchFixture(id, { x, y });
  }

  function handlePositionChange(id: number, x: number, y: number) {
    updateFixtureLocal(id, { x, y });
  }

  function handleSelect(id: number) {
    setSelectedFixtureId(id === selectedFixtureId ? null : id);
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onAddFixture(
      Math.max(0, Math.min(100, x)),
      Math.max(0, Math.min(100, y)),
    );
  }

  return (
    <div
      ref={canvasRef}
      className="relative flex-1 overflow-hidden"
      style={{ backgroundColor: "#111827" }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelectedFixtureId(null);
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Grid lines */}
      {GRID_LINES.map((pct) => (
        <div
          key={`h-${pct}`}
          className="absolute left-0 right-0 border-t border-gray-700 pointer-events-none opacity-40"
          style={{ top: `${pct}%` }}
        />
      ))}
      {GRID_LINES.map((pct) => (
        <div
          key={`v-${pct}`}
          className="absolute top-0 bottom-0 border-l border-gray-700 pointer-events-none opacity-40"
          style={{ left: `${pct}%` }}
        />
      ))}

      {/* Stage label */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-gray-600 text-xs pointer-events-none select-none tracking-widest uppercase">
        Stage
      </div>

      {/* Fixtures */}
      {fixtures.map((fixture) => (
        <FixtureNode
          key={fixture.id}
          fixture={fixture}
          channels={channels}
          isSelected={fixture.id === selectedFixtureId}
          canvasRef={canvasRef}
          onSelect={handleSelect}
          onDragEnd={handleDragEnd}
          onPositionChange={handlePositionChange}
        />
      ))}

      {/* Empty state */}
      {fixtures.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-600 text-sm">
            Right-click on the stage or use "+ Add Fixture" to add fixtures
          </p>
        </div>
      )}
    </div>
  );
}
