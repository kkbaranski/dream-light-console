import type { ColorPreset } from "../types";

export function resolveColorFromWheel(
  presets: ColorPreset[],
  dmxValue: number,
): { r: number; g: number; b: number } {
  if (presets.length === 0) return { r: 255, g: 255, b: 255 };
  let closest = presets[0];
  let minDist = Math.abs(dmxValue - presets[0].dmx);
  for (let i = 1; i < presets.length; i++) {
    const dist = Math.abs(dmxValue - presets[i].dmx);
    if (dist < minDist) {
      minDist = dist;
      closest = presets[i];
    }
  }
  return hexToRgb(closest.color);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
  };
}

export function presetThreshold(presets: { dmx: number }[]): number {
  return Math.floor(256 / presets.length / 2);
}
