export interface HealthResponse {
  status: string;
  version: string;
  dmx_fps: number;
}

export interface UniverseState {
  universe: number;
  channels: number[]; // 512 values, 0-255
}

export type WsMessage =
  | { type: "universe_update"; universe: number; channels: number[] }
  | { type: "pong" };

export type ControlMessage =
  | { type: "set_channel"; universe: number; channel: number; value: number }
  | { type: "set_channels"; universe: number; data: Record<string, number> }
  | { type: "set_universe"; universe: number; data: number[] }
  | { type: "ping" };

export type FixtureType = string;

export interface Fixture {
  id: number;
  name: string;
  universe: number;
  start_channel: number;
  channel_count: number;
  fixture_type: string;
  x: number; // 0–100 (percent of canvas width)
  y: number; // 0–100 (percent of canvas height)
}

export interface FixtureCreate {
  name: string;
  universe: number;
  start_channel: number;
  channel_count: number;
  fixture_type: string;
  x?: number;
  y?: number;
}

export interface FixtureUpdate {
  name?: string;
  fixture_type?: string;
  x?: number;
  y?: number;
}
