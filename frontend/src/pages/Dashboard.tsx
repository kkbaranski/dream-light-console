import { useDMXStore } from "../store/dmxStore";
import { Sidebar } from "../components/layout/Sidebar";
import { UniverseMonitor } from "../components/dmx/UniverseMonitor";
import { Badge } from "../components/ui/Badge";

export function Dashboard() {
  const backendOnline = useDMXStore((s) => s.backendOnline);
  const isConnected = useDMXStore((s) => s.isConnected);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 bg-gray-950 p-6 overflow-auto">
        <div className="mb-6 bg-gray-800 rounded-lg p-4 flex items-center gap-6">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Backend</p>
            <Badge color={backendOnline ? "green" : "red"}>{backendOnline ? "Online" : "Offline"}</Badge>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">WebSocket</p>
            <Badge color={isConnected ? "green" : "yellow"}>{isConnected ? "Live" : "Disconnected"}</Badge>
          </div>
        </div>
        <UniverseMonitor />
      </main>
    </div>
  );
}
