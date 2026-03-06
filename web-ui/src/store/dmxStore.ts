import { create } from "zustand";
import type { ControlMessage } from "../types";

interface DMXStore {
  channels: number[];
  isConnected: boolean;
  backendOnline: boolean;
  latencyMs: number | null;
  /** Send a DMX control message over WebSocket (throttled via RAF). */
  sendControl: (msg: ControlMessage) => void;
  /** Send a ping and measure round-trip time. */
  sendPing: () => void;
  // setters
  setChannels: (channels: number[]) => void;
  setChannel: (index: number, value: number) => void;
  setConnected: (isConnected: boolean) => void;
  setBackendOnline: (backendOnline: boolean) => void;
  setLatencyMs: (ms: number | null) => void;
  /** Called once by useWebSocket to inject the real send functions. */
  _bindControls: (
    sendControl: (msg: ControlMessage) => void,
    sendPing: () => void,
  ) => void;
}

export const useDMXStore = create<DMXStore>((set) => ({
  channels: Array<number>(512).fill(0),
  isConnected: false,
  backendOnline: false,
  latencyMs: null,
  sendControl: () => {},
  sendPing: () => {},
  setChannels: (channels) => set({ channels }),
  setChannel: (index, value) =>
    set((state) => {
      const next = [...state.channels];
      next[index] = value;
      return { channels: next };
    }),
  setConnected: (isConnected) => set({ isConnected }),
  setBackendOnline: (backendOnline) => set({ backendOnline }),
  setLatencyMs: (latencyMs) => set({ latencyMs }),
  _bindControls: (sendControl, sendPing) => set({ sendControl, sendPing }),
}));
