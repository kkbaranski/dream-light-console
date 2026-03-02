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

