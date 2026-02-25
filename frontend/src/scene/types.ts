interface SceneObjectBase {
  readonly id: string;
  position: [number, number, number];
  lockedFields: string[];
}

export interface MovingHeadObject extends SceneObjectBase {
  readonly type: "moving_head";
  name: string;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  universe: number;
  startChannel: number;
  dimmer: number;
  pan: number;
  tilt: number;
  color: string;
  coneAngle: number;
  powered: boolean;
}

export interface SpeakerOneObject extends SceneObjectBase {
  readonly type: "speaker_1";
}

export interface SpeakerTwoObject extends SceneObjectBase {
  readonly type: "speaker_2";
}

export interface TripodObject extends SceneObjectBase {
  readonly type: "tripod";
  height: number;
}

export interface TripodWithBarObject extends SceneObjectBase {
  readonly type: "tripod_with_bar";
  height: number;
}

export interface MicObject extends SceneObjectBase {
  readonly type: "mic";
}

export interface BarricadeObject extends SceneObjectBase {
  readonly type: "barricade";
}

export interface DiscoBallObject extends SceneObjectBase {
  readonly type: "disco_ball";
}

export interface DiscoBallTwoObject extends SceneObjectBase {
  readonly type: "disco_ball2";
}

export type LightObject = MovingHeadObject;

export type PropObject =
  | SpeakerOneObject
  | SpeakerTwoObject
  | TripodObject
  | TripodWithBarObject
  | MicObject
  | BarricadeObject
  | DiscoBallObject
  | DiscoBallTwoObject;

export type SceneObject = LightObject | PropObject;
export type SceneObjectType = SceneObject["type"];
export type ObjectPatch<T extends SceneObject> = Partial<Omit<T, "id" | "type">>;

export function isLight(object: SceneObject): object is LightObject {
  return object.type === "moving_head";
}

export function isProp(object: SceneObject): object is PropObject {
  return !isLight(object);
}

export function isTripod(object: SceneObject): object is TripodObject | TripodWithBarObject {
  return object.type === "tripod" || object.type === "tripod_with_bar";
}
