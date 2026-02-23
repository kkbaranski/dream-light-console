import { useRef, useState } from "react";
import type { Fixture } from "../../types";
import { getFixtureDef } from "../../fixtures/registry";
import { findCapability } from "../../fixtures/types";
import type { ColorPreset } from "../../fixtures/types";
import { resolveColorFromWheel } from "../../fixtures/capabilities/colorUtils";

interface FixtureNodeProps {
  fixture: Fixture;
  channels: number[];
  isSelected: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: number) => void;
  onDragEnd: (id: number, x: number, y: number) => void;
  onPositionChange: (id: number, x: number, y: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const OFF_BG = "rgb(55, 65, 81)";

function getFixtureStyle(
  fixture: Fixture,
  channels: number[],
): React.CSSProperties {
  const def = getFixtureDef(fixture.fixture_type);
  const sc = fixture.start_channel;

  const rgbCap = findCapability(def.capabilities, "rgb");
  if (rgbCap) {
    const r = channels[sc - 1 + rgbCap.offsetR] ?? 0;
    const g = channels[sc - 1 + rgbCap.offsetG] ?? 0;
    const b = channels[sc - 1 + rgbCap.offsetB] ?? 0;
    const brightness = Math.max(r, g, b) / 255;
    if (brightness <= 0.02) return { backgroundColor: OFF_BG };
    const glow = Math.round(4 + brightness * 24);
    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      boxShadow: `0 0 ${glow}px ${Math.round(glow * 0.5)}px rgba(${r},${g},${b},0.75)`,
    };
  }

  const dimmerCap = findCapability(def.capabilities, "dimmer");
  const colorWheelCap = findCapability(def.capabilities, "colorWheel");

  if (dimmerCap && colorWheelCap) {
    const dimmer = channels[sc - 1 + dimmerCap.offset] ?? 0;
    if (dimmer <= 5) return { backgroundColor: OFF_BG };
    const colorDMX = channels[sc - 1 + colorWheelCap.offset] ?? 0;
    const { r, g, b } = resolveColorFromWheel(colorWheelCap.presets, colorDMX);
    const br = dimmer / 255;
    const glow = Math.round(4 + br * 24);
    return {
      backgroundColor: `rgb(${Math.round(r * br)}, ${Math.round(g * br)}, ${Math.round(b * br)})`,
      boxShadow: `0 0 ${glow}px ${Math.round(glow * 0.5)}px rgba(${r},${g},${b},0.7)`,
    };
  }

  if (dimmerCap) {
    const raw = channels[sc - 1 + dimmerCap.offset] ?? 0;
    const brightness = raw / 255;
    if (brightness <= 0.02) return { backgroundColor: OFF_BG };
    const lum = Math.round(brightness * 255);
    const glow = Math.round(4 + brightness * 24);
    return {
      backgroundColor: `rgb(${lum}, ${lum}, ${lum})`,
      boxShadow: `0 0 ${glow}px ${Math.round(glow * 0.5)}px rgba(255,255,255,${(brightness * 0.8).toFixed(2)})`,
    };
  }

  return { backgroundColor: OFF_BG };
}

function getLabelColor(fixture: Fixture, channels: number[]): string {
  const def = getFixtureDef(fixture.fixture_type);
  const sc = fixture.start_channel;

  const rgbCap = findCapability(def.capabilities, "rgb");
  if (rgbCap) {
    const brightness =
      Math.max(
        channels[sc - 1 + rgbCap.offsetR] ?? 0,
        channels[sc - 1 + rgbCap.offsetG] ?? 0,
        channels[sc - 1 + rgbCap.offsetB] ?? 0,
      ) / 255;
    return brightness > 0.5 ? "#111827" : "#9ca3af";
  }

  const dimmerCap = findCapability(def.capabilities, "dimmer");
  if (dimmerCap) {
    const brightness = (channels[sc - 1 + dimmerCap.offset] ?? 0) / 255;
    return brightness > 0.5 ? "#111827" : "#9ca3af";
  }

  return "#9ca3af";
}

function getPanAngle(
  panCap: { type: "pan"; offset: number; label: string },
  sc: number,
  channels: number[],
): number {
  const dmx = channels[sc - 1 + panCap.offset] ?? 128;
  return ((dmx - 128) / 127) * 180;
}

function getTiltFrac(
  tiltCap: { type: "tilt"; offset: number; label: string },
  sc: number,
  channels: number[],
): number {
  return (channels[sc - 1 + tiltCap.offset] ?? 0) / 255;
}

/** Simple camera / moving-head icon for the fixture body */
function MovingHeadBodyIcon({ color }: { color: string }) {
  return (
    <svg
      width={20}
      height={18}
      viewBox="0 0 20 18"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      {/* Camera body */}
      <rect
        x={1}
        y={4}
        width={18}
        height={13}
        rx={2.5}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Lens */}
      <circle cx={10} cy={10.5} r={4} stroke={color} strokeWidth={1.5} />
      {/* Viewfinder bump */}
      <path
        d="M 6.5 4 L 8 1 L 12 1 L 13.5 4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Beam of light (moving head) ───────────────────────────────────────────────

interface BeamProps {
  panCap: { type: "pan"; offset: number; label: string };
  tiltCap: { type: "tilt"; offset: number; label: string };
  dimmerCap: { type: "dimmer"; offset: number; label: string };
  colorWheelCap?: { type: "colorWheel"; offset: number; presets: ColorPreset[] };
  sc: number;
  channels: number[];
  isSelected: boolean;
}

function MovingHeadBeam({
  panCap,
  tiltCap,
  dimmerCap,
  colorWheelCap,
  sc,
  channels,
  isSelected,
}: BeamProps) {
  const dimmer = channels[sc - 1 + dimmerCap.offset] ?? 0;

  if (!isSelected && dimmer < 5) return null;

  const panAngle = getPanAngle(panCap, sc, channels);
  const tiltFrac = getTiltFrac(tiltCap, sc, channels);

  const colorDMX = colorWheelCap
    ? (channels[sc - 1 + colorWheelCap.offset] ?? 0)
    : 0;
  const { r, g, b } = colorWheelCap
    ? resolveColorFromWheel(colorWheelCap.presets, colorDMX)
    : { r: 255, g: 255, b: 255 };
  const colorStr = `rgb(${r},${g},${b})`;

  const opacity = isSelected && dimmer < 5 ? 0.12 : (dimmer / 255) * 0.48;

  const CX = 160;
  const CY = 160;

  if (tiltFrac < 0.06) {
    const radius = 28 + tiltFrac * 120;
    return (
      <svg
        style={{
          position: "absolute",
          left: -160,
          top: -160,
          width: 320,
          height: 320,
          pointerEvents: "none",
          zIndex: 1,
          overflow: "visible",
        }}
      >
        <circle cx={CX} cy={CY} r={radius} fill={colorStr} opacity={opacity * 0.7} />
        <circle cx={CX} cy={CY} r={10} fill={colorStr} opacity={opacity} />
      </svg>
    );
  }

  const beamLength = 55 + tiltFrac * 105;
  const halfAngleDeg = 11 + tiltFrac * 29;
  const halfAngleRad = (halfAngleDeg * Math.PI) / 180;
  const halfWidth = Math.tan(halfAngleRad) * beamLength;

  return (
    <svg
      style={{
        position: "absolute",
        left: -160,
        top: -160,
        width: 320,
        height: 320,
        pointerEvents: "none",
        zIndex: 1,
        overflow: "visible",
      }}
    >
      <g transform={`translate(${CX}, ${CY}) rotate(${panAngle})`}>
        <polygon
          points={`0,0 ${(-halfWidth).toFixed(1)},${(-beamLength).toFixed(1)} ${halfWidth.toFixed(1)},${(-beamLength).toFixed(1)}`}
          fill={colorStr}
          opacity={opacity.toFixed(3)}
        />
        <circle
          cx={0}
          cy={0}
          r={6}
          fill={colorStr}
          opacity={Math.min(1, opacity * 1.8).toFixed(3)}
        />
      </g>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FixtureNode({
  fixture,
  channels,
  isSelected,
  canvasRef,
  onSelect,
  onDragEnd,
  onPositionChange,
}: FixtureNodeProps) {
  const bodyDrag = useRef<{
    startClientX: number;
    startClientY: number;
    startFx: number;
    startFy: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sc = fixture.start_channel;

  // ── Body drag ──────────────────────────────────────────────────────────────
  function handleBodyDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bodyDrag.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFx: fixture.x,
      startFy: fixture.y,
    };
    setIsDragging(false);
  }

  function handleBodyMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!bodyDrag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - bodyDrag.current.startClientX;
    const dy = e.clientY - bodyDrag.current.startClientY;
    if (!isDragging && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    setIsDragging(true);
    onPositionChange(
      fixture.id,
      clamp(bodyDrag.current.startFx + (dx / rect.width) * 100, 0, 100),
      clamp(bodyDrag.current.startFy + (dy / rect.height) * 100, 0, 100),
    );
  }

  function handleBodyUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!bodyDrag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - bodyDrag.current.startClientX;
    const dy = e.clientY - bodyDrag.current.startClientY;
    if (!isDragging && Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      onSelect(fixture.id);
    } else {
      onDragEnd(
        fixture.id,
        clamp(bodyDrag.current.startFx + (dx / rect.width) * 100, 0, 100),
        clamp(bodyDrag.current.startFy + (dy / rect.height) * 100, 0, 100),
      );
    }
    bodyDrag.current = null;
    setIsDragging(false);
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const def = getFixtureDef(fixture.fixture_type);
  const panCap = findCapability(def.capabilities, "pan");
  const tiltCap = findCapability(def.capabilities, "tilt");
  const dimmerCap = findCapability(def.capabilities, "dimmer");
  const colorWheelCap = findCapability(def.capabilities, "colorWheel");
  const isMovingHead = !!(panCap || tiltCap);

  const colorStyle = getFixtureStyle(fixture, channels);
  const labelColor = getLabelColor(fixture, channels);
  const panAngle = panCap ? getPanAngle(panCap, sc, channels) : 0;

  return (
    // Origin = fixture coordinate; width/height 0 so it doesn't block canvas clicks
    <div
      className="absolute select-none"
      style={{
        left: `${fixture.x}%`,
        top: `${fixture.y}%`,
        width: 0,
        height: 0,
        zIndex: isSelected ? 20 : 10,
      }}
    >
      {/* ── Beam of light (moving heads) ─────────────────────────────────── */}
      {isMovingHead && panCap && tiltCap && dimmerCap && (
        <MovingHeadBeam
          panCap={panCap}
          tiltCap={tiltCap}
          dimmerCap={dimmerCap}
          colorWheelCap={colorWheelCap}
          sc={sc}
          channels={channels}
          isSelected={isSelected}
        />
      )}

      {/* ── Fixture name (above body) ─────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: -40,
          left: 0,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          color: "#d1d5db",
          fontSize: 11,
          pointerEvents: "none",
        }}
      >
        {fixture.name}
      </div>

      {/* ── Fixture body ─────────────────────────────────────────────────── */}
      <div
        onPointerDown={handleBodyDown}
        onPointerMove={handleBodyMove}
        onPointerUp={handleBodyUp}
        style={{
          position: "absolute",
          left: -20,
          top: -20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid rgb(107,114,128)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isDragging ? "grabbing" : "move",
          transform: isSelected ? "scale(1.18)" : "scale(1)",
          transformOrigin: "20px 20px",
          transition:
            "transform 0.1s ease-out, box-shadow 0.075s ease-in-out, background-color 0.075s",
          filter: isSelected
            ? "drop-shadow(0 0 8px rgba(255,255,255,0.55))"
            : "none",
          zIndex: 5,
          ...colorStyle,
        }}
      >
        {/* Body content: camera icon for moving heads, channel number otherwise */}
        {isMovingHead ? (
          <MovingHeadBodyIcon color={labelColor} />
        ) : (
          <span
            className="text-xs font-bold select-none leading-none"
            style={{ color: labelColor, position: "relative", zIndex: 1 }}
          >
            {sc}
          </span>
        )}

        {/* Pan direction arrow (overlaid on body) */}
        {panCap && (
          <svg
            width={40}
            height={40}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <g transform={`translate(20, 20) rotate(${panAngle})`}>
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-13}
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.9}
              />
              <polygon points="0,-16 -3,-11 3,-11" fill="white" opacity={0.9} />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
