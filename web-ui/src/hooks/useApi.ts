import { useEffect } from "react";
import type { HealthResponse } from "../types/generated/HealthResponse";
import { useDMXStore } from "../store/dmxStore";

const POLL_INTERVAL_MS = 3000;

export function useApi(): { backendOnline: boolean } {
  const setBackendOnline = useDMXStore((state) => state.setBackendOnline);
  const backendOnline = useDMXStore((state) => state.backendOnline);

  useEffect(() => {
    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch("/health");
        if (!response.ok) {
          setBackendOnline(false);
          return;
        }
        const data = (await response.json()) as HealthResponse;
        setBackendOnline(data.status === "ok");
      } catch {
        setBackendOnline(false);
      }
    }

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [setBackendOnline]);

  return { backendOnline };
}
