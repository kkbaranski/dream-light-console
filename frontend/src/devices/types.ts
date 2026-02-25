/**
 * Describes model nodes that rotate to animate pan, and the physical range.
 */
export interface PanDef {
  nodeNames: string[];
  totalDegrees: number;   // e.g. 540 = ±270°
}

/**
 * Describes model nodes that rotate to animate tilt, and the physical range.
 */
export interface TiltDef {
  nodeNames: string[];
  startDegrees: number;   // initial offset, e.g. 90
  totalDegrees: number;   // total travel, e.g. 359
}

/**
 * Describes the emitted beam of light.
 */
export interface BeamDef {
  originNodeName: string;      // model node from which the beam fires
  glowMaterialName: string;    // material name of the lens aperture
  lensOffset: number;          // distance from origin node to lens aperture (metres)
  lensRadius: number;          // lens aperture radius (metres)
  maxLength: number;           // maximum visible beam length (metres)
  coneAngle: { min: number; max: number; default: number };
}

/**
 * Describes DMX fixture addressing.
 */
export interface FixtureDef {
  defaultChannels: number;
}

/**
 * Complete declarative definition for a light device.
 *
 * Pure data — no logic, no React, no Three.js.
 * The renderer (e.g. MovingHead.tsx) reads this to drive all behaviour.
 * Add only the optional fields the device actually supports.
 */
export interface LightDeviceDef {
  readonly type: string;
  readonly label: string;
  readonly modelPath: string;
  readonly targetHeight: number;  // metres — used to normalise model scale
  readonly pan?: PanDef;
  readonly tilt?: TiltDef;
  readonly beam?: BeamDef;
  readonly fixture?: FixtureDef;
}
