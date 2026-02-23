import { useDMXStore } from "../../store/dmxStore";
import { Badge } from "../ui/Badge";

export function TopBar() {
  const backendOnline = useDMXStore((s) => s.backendOnline);
  const isConnected = useDMXStore((s) => s.isConnected);
  const latencyMs = useDMXStore((s) => s.latencyMs);
  const sendPing = useDMXStore((s) => s.sendPing);

  return (
    <header className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between border-b border-gray-700">
      <span className="font-bold text-lg tracking-wide">Dream Light Console</span>
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-sm">Backend</span>
        <Badge color={backendOnline ? "green" : "red"}>
          {backendOnline ? "Online" : "Offline"}
        </Badge>
        <span className="text-gray-400 text-sm">DMX</span>
        <Badge color={isConnected ? "green" : "yellow"}>
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
        <button
          onClick={sendPing}
          className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors font-mono"
        >
          {latencyMs !== null ? `${latencyMs}ms` : "Ping"}
        </button>
      </div>
    </header>
  );
}
