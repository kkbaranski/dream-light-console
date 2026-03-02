import { useDMXStore } from "../../store/dmxStore";
import { Badge } from "../ui/Badge";

export function TopBar() {
  const backendOnline = useDMXStore((state) => state.backendOnline);
  const isConnected = useDMXStore((state) => state.isConnected);

  return (
    <header className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between border-b border-gray-800 flex-shrink-0">
      <span className="font-semibold text-base tracking-wide">☾ Dream Light Console</span>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs">Backend</span>
        <Badge color={backendOnline ? "green" : "red"}>
          {backendOnline ? "Online" : "Offline"}
        </Badge>
        <span className="text-gray-500 text-xs">DMX</span>
        <Badge color={isConnected ? "green" : "yellow"}>
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
      </div>
    </header>
  );
}
