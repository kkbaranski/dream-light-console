import { useDMXStore } from "../../store/dmxStore";
import { useStageStore } from "../../store/stageStore";
import type { Fixture } from "../../types";
import { getFixtureDef } from "../../fixtures/registry";
import { findCapability, type Capability } from "../../fixtures/types";
import { CapabilityControl } from "../../fixtures/capabilities";

// ── Fixture inspector ─────────────────────────────────────────────────────────

interface InspectorProps {
  fixture: Fixture;
  channels: number[];
  setChannelStore: (index: number, value: number) => void;
  onDelete: () => void;
}

function capKey(cap: Capability): string {
  return cap.type === "rgb" ? "rgb" : `${cap.type}-${cap.offset}`;
}

function FixtureInspector({
  fixture,
  channels,
  setChannelStore,
  onDelete,
}: InspectorProps) {
  const sc = fixture.start_channel;
  const universe = fixture.universe;
  const def = getFixtureDef(fixture.fixture_type);
  const sendControl = useDMXStore((s) => s.sendControl);

  function onChannelChange(dmxChannel: number, value: number) {
    setChannelStore(dmxChannel - 1, value);
    sendControl({ type: "set_channel", universe, channel: dmxChannel, value });
  }

  function isOn(): boolean {
    const dimmerCap = findCapability(def.capabilities, "dimmer");
    if (dimmerCap) {
      return (channels[sc - 1 + dimmerCap.offset] ?? 0) > 0;
    }
    const rgbCap = findCapability(def.capabilities, "rgb");
    if (rgbCap) {
      return (
        Math.max(
          channels[sc - 1 + rgbCap.offsetR] ?? 0,
          channels[sc - 1 + rgbCap.offsetG] ?? 0,
          channels[sc - 1 + rgbCap.offsetB] ?? 0,
        ) > 0
      );
    }
    return false;
  }

  function toggleOnOff() {
    const val = isOn() ? 0 : 255;
    const dimmerCap = findCapability(def.capabilities, "dimmer");
    if (dimmerCap) {
      onChannelChange(sc + dimmerCap.offset, val);
      return;
    }
    const rgbCap = findCapability(def.capabilities, "rgb");
    if (rgbCap) {
      onChannelChange(sc + rgbCap.offsetR, val);
      onChannelChange(sc + rgbCap.offsetG, val);
      onChannelChange(sc + rgbCap.offsetB, val);
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-white font-semibold text-sm leading-tight">
            {fixture.name}
          </div>
          <div className="text-gray-500 text-xs mt-0.5">
            U{fixture.universe} · ch {sc}
            {fixture.channel_count > 1
              ? `–${sc + fixture.channel_count - 1}`
              : ""}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${def.badgeClass}`}
        >
          {def.label}
        </span>
      </div>

      {/* On / Off */}
      <button
        onClick={toggleOnOff}
        className={`text-xs font-semibold px-3 py-1.5 rounded w-full transition-colors ${
          isOn()
            ? "bg-yellow-500 hover:bg-yellow-400 text-black"
            : "bg-gray-700 hover:bg-gray-600 text-gray-400"
        }`}
      >
        {isOn() ? "ON" : "OFF"}
      </button>

      {/* Capabilities */}
      {def.capabilities.map((cap) => (
        <CapabilityControl
          key={capKey(cap)}
          capability={cap}
          startChannel={sc}
          universe={universe}
          channels={channels}
          onChannelChange={onChannelChange}
        />
      ))}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="text-xs text-red-400 hover:text-red-300 bg-gray-800 hover:bg-red-900/20 border border-gray-700 hover:border-red-800 px-3 py-1.5 rounded transition-colors w-full mt-1"
      >
        Delete fixture
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface AddFixturePanelProps {
  onAddFixtureClick: () => void;
}

export function AddFixturePanel({ onAddFixtureClick }: AddFixturePanelProps) {
  const selectedFixtureId = useStageStore((s) => s.selectedFixtureId);
  const fixtures = useStageStore((s) => s.fixtures);
  const deleteFixture = useStageStore((s) => s.deleteFixture);
  const channels = useDMXStore((s) => s.channels);
  const setChannelStore = useDMXStore((s) => s.setChannel);

  const selectedFixture: Fixture | null =
    fixtures.find((f) => f.id === selectedFixtureId) ?? null;

  return (
    <aside className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col overflow-y-auto flex-shrink-0">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={onAddFixtureClick}
          className="w-full text-sm font-medium px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          + Add Fixture
        </button>
      </div>

      {/* ── Fixture inspector ─────────────────────────────────────────── */}
      {selectedFixture ? (
        <FixtureInspector
          fixture={selectedFixture}
          channels={channels}
          setChannelStore={setChannelStore}
          onDelete={() => void deleteFixture(selectedFixture.id)}
        />
      ) : (
        <div className="p-4 text-gray-600 text-xs italic">
          Select a fixture on the canvas to inspect it.
        </div>
      )}
    </aside>
  );
}
