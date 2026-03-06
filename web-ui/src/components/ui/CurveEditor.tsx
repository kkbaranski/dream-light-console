import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { createSpline, type CurvePoint } from "../../lib/cubicSpline";

interface CurveEditorProps {
  points: CurvePoint[];
  xMax: number;
  yMax: number;
  dmxValue?: number;
  onChange: (points: CurvePoint[]) => void;
  onDragPreview?: (dmxValue: number | null) => void;
}

const W = 260;
const H = 200;
const PAD_L = 32;
const PAD_R = 28;
const PAD_T = 12;
const PAD_B = 14;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const HOVER_THRESHOLD = 10;
const POINT_PROXIMITY = 12;

function toSvgX(x: number, xMax: number): number {
  return PAD_L + (x / xMax) * PLOT_W;
}
function toSvgY(y: number, yMax: number): number {
  return PAD_T + (1 - y / yMax) * PLOT_H;
}
function fromSvgX(sx: number, xMax: number): number {
  return ((sx - PAD_L) / PLOT_W) * xMax;
}
function fromSvgY(sy: number, yMax: number): number {
  return (1 - (sy - PAD_T) / PLOT_H) * yMax;
}

function formatAxisValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function CurveEditor({ points, xMax, yMax, dmxValue, onChange, onDragPreview }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragPoints, setDragPoints] = useState<CurvePoint[] | null>(null);
  const didDrag = useRef(false);

  const [hoverDot, setHoverDot] = useState<CurvePoint | null>(null);

  const [fadeAngle, setFadeAngle] = useState<number | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  const activePoints = dragPoints ?? points;

  const evaluate = useMemo(() => {
    if (activePoints.length < 2) return null;
    return createSpline(activePoints, { min: 0, max: yMax });
  }, [activePoints, yMax]);

  const curvePath = useMemo(() => {
    if (!evaluate) return "";
    const steps = 256;
    const parts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * xMax;
      const y = evaluate(x);
      parts.push(`${i === 0 ? "M" : "L"}${toSvgX(x, xMax).toFixed(1)},${toSvgY(y, yMax).toFixed(1)}`);
    }
    return parts.join(" ");
  }, [evaluate, xMax, yMax]);

  const angleAtDmx = useMemo(() => {
    if (dmxValue == null || !evaluate) return null;
    return evaluate(dmxValue);
  }, [dmxValue, evaluate]);

  const getSvgCoords = useCallback((e: React.MouseEvent | React.PointerEvent): { sx: number; sy: number } => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      sx: ((e.clientX - rect.left) / rect.width) * W,
      sy: ((e.clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const endDrag = useCallback(() => {
    if (dragPoints && dragIdx !== null) {
      onChange(dragPoints);
      setFadeAngle(dragPoints[dragIdx].y);
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setFadeAngle(null), 600);
    }
    setDragIdx(null);
    setDragPoints(null);
    onDragPreview?.(null);
  }, [dragIdx, dragPoints, onChange, onDragPreview]);

  const handlePointPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== 0 || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    didDrag.current = false;
    setDragIdx(idx);
    setDragPoints([...points]);
    setHoverDot(null);
    clearTimeout(fadeTimer.current);
    setFadeAngle(null);
  }, [points]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const { sx, sy } = getSvgCoords(e);

    if (dragIdx !== null && dragPoints) {
      didDrag.current = true;
      const rawX = fromSvgX(sx, xMax);
      const rawY = fromSvgY(sy, yMax);

      const isFirst = dragIdx === 0;
      const isLast = dragIdx === dragPoints.length - 1;

      let x: number;
      if (isFirst) x = 0;
      else if (isLast) x = xMax;
      else {
        const lo = dragPoints[dragIdx - 1].x + 1;
        const hi = dragPoints[dragIdx + 1].x - 1;
        x = Math.round(Math.max(lo, Math.min(hi, rawX)));
      }

      const y = Math.max(0, Math.min(yMax, rawY));

      const next = [...dragPoints];
      next[dragIdx] = { x, y };
      setDragPoints(next);
      onChange(next);
      onDragPreview?.(x);
      return;
    }

    if (!evaluate) { setHoverDot(null); return; }

    if (sx < PAD_L || sx > W - PAD_R || sy < PAD_T || sy > H - PAD_B) {
      setHoverDot(null);
      return;
    }

    const dataX = fromSvgX(sx, xMax);
    const curveY = evaluate(dataX);
    const curveSy = toSvgY(curveY, yMax);
    const dist = Math.abs(sy - curveSy);

    const nearExisting = points.some(p => Math.abs(toSvgX(p.x, xMax) - sx) < POINT_PROXIMITY);

    if (dist < HOVER_THRESHOLD && !nearExisting) {
      setHoverDot({ x: Math.round(Math.max(0, Math.min(xMax, dataX))), y: curveY });
    } else {
      setHoverDot(null);
    }
  }, [dragIdx, dragPoints, getSvgCoords, xMax, yMax, onChange, evaluate, points]);

  const handlePointerUp = useCallback(() => {
    if (dragIdx !== null) endDrag();
  }, [dragIdx, endDrag]);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (!hoverDot) return;
    e.stopPropagation();
    const next = [...points, hoverDot].sort((a, b) => a.x - b.x);
    onChange(next);
    setHoverDot(null);
  }, [points, onChange, hoverDot]);

  const handleRemovePoint = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (idx === 0 || idx === points.length - 1) return;
    if (points.length <= 2) return;
    onChange(points.filter((_, i) => i !== idx));
  }, [points, onChange]);

  const handleReset = useCallback(() => {
    onChange([{ x: 0, y: 0 }, { x: xMax, y: yMax }]);
  }, [xMax, yMax, onChange]);

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  // ─── Grid & axis config ───────────────────────────────────────────────

  // Major grid at 25% (labeled), minor grid at 5% (subtle)
  const majorSet = new Set([0.25, 0.5, 0.75]);
  const gridFractions: Array<{ f: number; major: boolean }> = [];
  for (let i = 1; i <= 19; i++) {
    const f = i / 20;
    gridFractions.push({ f, major: majorSet.has(f) });
  }
  const labelFractions = [0, 0.25, 0.5, 0.75, 1];

  const dmxLineSx = dmxValue != null ? toSvgX(dmxValue, xMax) : null;

  const dragAngleY = dragIdx !== null && dragPoints ? dragPoints[dragIdx].y : null;
  const angleLineY = dragAngleY ?? fadeAngle;
  const angleLineFading = dragAngleY === null && fadeAngle !== null;

  const plotLeft = PAD_L;
  const plotRight = W - PAD_R;
  const plotTop = PAD_T;
  const plotBottom = H - PAD_B;

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full bg-gray-900 rounded-lg border border-gray-700 select-none"
        style={{ cursor: hoverDot ? "copy" : dragIdx !== null ? "grabbing" : "default" }}
        onClick={handleSvgClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setHoverDot(null);
          if (dragIdx !== null) endDrag();
        }}
      >
        {/* Grid: major (25%) thicker, minor (5%) subtle */}
        {gridFractions.map(({ f, major }) => (
          <g key={f}>
            <line
              x1={plotLeft + f * PLOT_W} y1={plotTop}
              x2={plotLeft + f * PLOT_W} y2={plotBottom}
              stroke={major ? "#4b5563" : "#2d3748"} strokeWidth={major ? 0.7 : 0.3}
            />
            <line
              x1={plotLeft} y1={plotTop + f * PLOT_H}
              x2={plotRight} y2={plotTop + f * PLOT_H}
              stroke={major ? "#4b5563" : "#2d3748"} strokeWidth={major ? 0.7 : 0.3}
            />
          </g>
        ))}

        {/* Axes */}
        <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke="#4b5563" strokeWidth={1} />
        <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="#4b5563" strokeWidth={1} />

        {/* X axis values */}
        {labelFractions.map((f) => {
          const val = Math.round(f * xMax);
          const sx = plotLeft + f * PLOT_W;
          return (
            <text key={`x${f}`} x={sx} y={plotBottom + 11} textAnchor="middle" fill="#6b7280" fontSize={7}>
              {val}
            </text>
          );
        })}

        {/* Y axis values with ° */}
        {labelFractions.map((f) => {
          const val = f * yMax;
          const sy = plotTop + (1 - f) * PLOT_H;
          return (
            <text key={`y${f}`} x={plotLeft - 3} y={sy + 3} textAnchor="end" fill="#6b7280" fontSize={7}>
              {formatAxisValue(val)}°
            </text>
          );
        })}

        {/* DMX vertical line */}
        {dmxLineSx != null && dmxLineSx >= plotLeft && dmxLineSx <= plotRight && (
          <>
            <line x1={dmxLineSx} y1={plotTop} x2={dmxLineSx} y2={plotBottom} stroke="#22c55e" strokeWidth={1} strokeDasharray="3,2" opacity={0.7} />
            <text x={dmxLineSx} y={plotTop - 3} textAnchor="middle" fill="#22c55e" fontSize={7}>{Math.round(dmxValue!)}</text>
          </>
        )}

        {/* Angle horizontal line */}
        {angleLineY != null && (() => {
          const clampedY = Math.max(0, Math.min(yMax, angleLineY));
          const sy = toSvgY(clampedY, yMax);
          return (
            <>
              <line
                x1={plotLeft} y1={sy} x2={plotRight} y2={sy}
                stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2"
                opacity={angleLineFading ? 0.3 : 0.8}
                className={angleLineFading ? "transition-opacity duration-500" : ""}
              />
              <text
                x={plotRight + 2} y={sy + 3}
                textAnchor="start" fill="#f59e0b" fontSize={7}
                opacity={angleLineFading ? 0.3 : 1}
                className={angleLineFading ? "transition-opacity duration-500" : ""}
              >
                {clampedY.toFixed(1)}°
              </text>
            </>
          );
        })()}

        {/* Intersection dot (DMX line × curve) */}
        {dmxLineSx != null && angleAtDmx != null && dmxLineSx >= plotLeft && dmxLineSx <= plotRight && (
          <circle
            cx={dmxLineSx}
            cy={toSvgY(angleAtDmx, yMax)}
            r={3}
            fill="#22c55e"
            opacity={0.9}
          />
        )}

        {/* Curve */}
        {curvePath && <path d={curvePath} fill="none" stroke="#60a5fa" strokeWidth={1.5} />}

        {/* Hover dot */}
        {hoverDot && (
          <circle
            cx={toSvgX(hoverDot.x, xMax)}
            cy={toSvgY(hoverDot.y, yMax)}
            r={4}
            fill="#60a5fa"
            opacity={0.6}
            className="pointer-events-none"
          />
        )}

        {/* Control points */}
        {activePoints.map((pt, i) => {
          const isEndpoint = i === 0 || i === activePoints.length - 1;
          return (
            <circle
              key={i}
              cx={toSvgX(pt.x, xMax)}
              cy={toSvgY(pt.y, yMax)}
              r={5}
              fill={dragIdx === i ? "#93c5fd" : "#3b82f6"}
              stroke="white"
              strokeWidth={1.5}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handlePointPointerDown(e, i)}
              onContextMenu={(e) => handleRemovePoint(e, i)}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey && !isEndpoint) handleRemovePoint(e, i);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!isEndpoint) handleRemovePoint(e, i);
              }}
            />
          );
        })}
      </svg>

      <button
        onClick={handleReset}
        className="self-start text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        Reset to Linear
      </button>
    </div>
  );
}
