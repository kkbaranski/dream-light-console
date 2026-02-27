export type { SceneObjectType } from "../devices/registry";

/** All fields guaranteed to exist on every placed object regardless of device type. */
export interface SceneObject {
  readonly id: string;
  readonly type: import("../devices/registry").SceneObjectType;
  position: [number, number, number];
  lockedFields: string[];
}

export type ObjectPatch = Partial<Record<string, unknown>>;
