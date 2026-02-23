import type { FixtureDef } from "./types";
import { genericDef } from "./definitions/generic";
import { rgbDef } from "./definitions/rgb";
import { movingHeadDef } from "./definitions/movingHead";

const registry = new Map<string, FixtureDef>([
  [genericDef.id, genericDef],
  [rgbDef.id, rgbDef],
  [movingHeadDef.id, movingHeadDef],
]);

export function getFixtureDef(id: string): FixtureDef {
  return registry.get(id) ?? genericDef;
}

export function getAllFixtureDefs(): FixtureDef[] {
  return [...registry.values()];
}
