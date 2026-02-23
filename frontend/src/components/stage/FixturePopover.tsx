import { useEffect, useRef } from "react";
import type { Fixture } from "../../types";
import { useStageStore } from "../../store/stageStore";
import { useDMXStore } from "../../store/dmxStore";
import { ChannelFader } from "../dmx/ChannelFader";
import { Button } from "../ui/Button";

interface FixturePopoverProps {
  fixture: Fixture;
  onClose: () => void;
}

export function FixturePopover({ fixture, onClose }: FixturePopoverProps) {
  const deleteFixture = useStageStore((s) => s.deleteFixture);
  const channels = useDMXStore((s) => s.channels);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  // Flip to left side when fixture is near the right edge
  const flipLeft = fixture.x > 70;
  const flipUp = fixture.y > 75;

  const horizontalStyle = flipLeft
    ? { right: `calc(${100 - fixture.x}% + 28px)` }
    : { left: `calc(${fixture.x}% + 28px)` };

  const verticalStyle = flipUp
    ? { bottom: `calc(${100 - fixture.y}% - 20px)` }
    : { top: `${fixture.y}%`, transform: "translateY(-50%)" };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 w-56"
      style={{ ...horizontalStyle, ...verticalStyle }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-semibold text-sm truncate">{fixture.name}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none ml-2 flex-shrink-0"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="text-gray-400 text-xs mb-3">
        Universe {fixture.universe} · ch {fixture.start_channel}
        {fixture.channel_count > 1 ? `–${fixture.start_channel + fixture.channel_count - 1}` : ""}
      </div>

      <div className="flex gap-1 justify-center mb-4 overflow-x-auto py-1">
        {Array.from({ length: fixture.channel_count }, (_, i) => {
          const ch = fixture.start_channel + i;
          return (
            <ChannelFader key={ch} channel={ch} value={channels[ch - 1] ?? 0} />
          );
        })}
      </div>

      <Button
        variant="secondary"
        className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/30 text-xs"
        onClick={() => void deleteFixture(fixture.id)}
      >
        Delete fixture
      </Button>
    </div>
  );
}
