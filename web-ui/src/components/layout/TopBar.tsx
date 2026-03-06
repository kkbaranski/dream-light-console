import { useDMXStore } from "../../store/dmxStore";
import { useSidebarStore } from "./Sidebar";
import { Badge } from "../ui/Badge";

export function TopBar() {
  const backendOnline = useDMXStore((state) => state.backendOnline);
  const isConnected = useDMXStore((state) => state.isConnected);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  return (
    <header className="bg-gray-900 text-white py-3 pr-6 flex items-center justify-between border-b border-gray-800 flex-shrink-0">
      <div className="flex items-center">
        <button
          onClick={toggleSidebar}
          className="w-12 text-center text-xl text-gray-400 hover:text-white transition-colors"
        >
          &#9776;
        </button>
        <span className="font-semibold text-base tracking-wide">☾ Dream Light Console</span>
      </div>
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
