/**
 * Thin wrapper around the cubic-spline package for DMX-to-angle response curves.
 * Points are sorted by X (DMX value). Y is the output in degrees.
 */

import Spline from "cubic-spline";

export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Build a spline evaluator from sorted control points.
 * Returns a function that maps x → y via natural cubic spline interpolation.
 * When clamp is provided, output is clamped to [clamp.min, clamp.max] to prevent
 * overshoot beyond the physical range (e.g. motor hard-stops).
 */
export function createSpline(
  points: ReadonlyArray<CurvePoint>,
  clamp?: { min: number; max: number },
): (x: number) => number {
  const spline = new Spline(
    points.map(p => p.x),
    points.map(p => p.y),
  );
  if (clamp) {
    return (x: number) => Math.max(clamp.min, Math.min(clamp.max, spline.at(x)));
  }
  return (x: number) => spline.at(x);
}
