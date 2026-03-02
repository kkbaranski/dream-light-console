import { useEffect, useRef } from "react";
import type { WsMessage, ControlMessage } from "../types";
import { useDMXStore } from "../store/dmxStore";

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

const WS_URL = getWsUrl();
const RECONNECT_DELAY_MS = 2000;

export function useWebSocket(): void {
  const setChannels = useDMXStore((state) => state.setChannels);
  const setConnected = useDMXStore((state) => state.setConnected);
  const setLatencyMs = useDMXStore((state) => state.setLatencyMs);
  const _bindControls = useDMXStore((state) => state._bindControls);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  const pendingRef = useRef<Map<string, ControlMessage>>(new Map());
  const pingTsRef = useRef<number | null>(null);

  useEffect(() => {
    unmounted.current = false;

    function connect(): void {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          if (msg.type === "universe_update") {
            setChannels(msg.channels);
          } else if (msg.type === "pong") {
            if (pingTsRef.current !== null) {
              setLatencyMs(Math.round(performance.now() - pingTsRef.current));
              pingTsRef.current = null;
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!unmounted.current) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    // RAF flush: coalesces pending control messages, sends at ~60fps
    let rafId = 0;
    function flush(): void {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && pendingRef.current.size > 0) {
        for (const msg of pendingRef.current.values()) {
          ws.send(JSON.stringify(msg));
        }
        pendingRef.current.clear();
      }
      rafId = requestAnimationFrame(flush);
    }

    function sendControl(msg: ControlMessage): void {
      const key =
        msg.type === "set_channel"
          ? `${msg.universe}:${msg.channel}`
          : msg.type;
      pendingRef.current.set(key, msg);
    }

    function sendPing(): void {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        pingTsRef.current = performance.now();
        ws.send('{"type":"ping"}');
      }
    }

    rafId = requestAnimationFrame(flush);
    _bindControls(sendControl, sendPing);
    connect();

    return () => {
      unmounted.current = true;
      cancelAnimationFrame(rafId);
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
      }
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
