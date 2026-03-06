import { useState } from "react";
import { useDMXStore } from "../../store/dmxStore";
import { useSidebarStore } from "./Sidebar";
import { Badge } from "../ui/Badge";

const REAL_OUTPUTS = new Set(["enttec_pro", "artnet", "sacn"]);

export function TopBar() {
  const backendOnline = useDMXStore((state) => state.backendOnline);
  const isConnected = useDMXStore((state) => state.isConnected);
  const dmxOutput = useDMXStore((state) => state.dmxOutput);
  const setDmxOutput = useDMXStore((state) => state.setDmxOutput);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const [reconnecting, setReconnecting] = useState(false);

  const hasHardware = REAL_OUTPUTS.has(dmxOutput);

  async function handleReconnect() {
    setReconnecting(true);
    try {
      const resp = await fetch("/api/dmx/reconnect", { method: "POST" });
      if (resp.ok) {
        const data = (await resp.json()) as { dmx_output: string };
        setDmxOutput(data.dmx_output);
      }
    } catch {
      // health poll will update status
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <header className="bg-gray-900 text-white py-3 pr-6 flex items-center justify-between border-b border-gray-800 flex-shrink-0">
      <div className="flex items-center">
        <button
          onClick={toggleSidebar}
          className="w-12 text-center text-xl text-gray-400 hover:text-white transition-colors"
        >
          &#9776;
        </button>
        <span className="font-semibold text-base tracking-wide">&#9790; Dream Light Console</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs">Backend</span>
        <Badge color={backendOnline ? "green" : "red"}>
          {backendOnline ? "Online" : "Offline"}
        </Badge>
        <span className="text-gray-500 text-xs">WebSocket</span>
        <Badge color={isConnected ? "green" : "yellow"}>
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
        <span className="text-gray-500 text-xs">DMX</span>
        <div className="flex items-stretch">
          <Badge
            color={hasHardware ? "green" : "yellow"}
            className={backendOnline ? "rounded-l rounded-r-none" : "rounded"}
          >
            {hasHardware ? dmxOutput.replace("_", " ") : "No Interface"}
          </Badge>
          {backendOnline && (
            <button
              onClick={() => void handleReconnect()}
              disabled={reconnecting}
              title={hasHardware ? "Reconnect DMX" : "Detect DMX interface"}
              className="w-6 flex items-center justify-center rounded-r rounded-l-none bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5${reconnecting ? " animate-spin" : ""}`}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M1 8a7 7 0 0 1 12.45-4.36" />
                <path d="M15 8a7 7 0 0 1-12.45 4.36" />
                <polyline points="13 1 13.45 3.64 10.81 4.09" />
                <polyline points="3 15 2.55 12.36 5.19 11.91" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
