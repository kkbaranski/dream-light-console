import { useDMXStore } from "../../store/dmxStore";
import { ChannelFader } from "./ChannelFader";

export function UniverseMonitor() {
  const channels = useDMXStore((state) => state.channels);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-white font-semibold mb-4">Universe 1 — Live Monitor</h2>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {channels.slice(0, 16).map((value, index) => (
          <ChannelFader key={index + 1} channel={index + 1} value={value} />
        ))}
      </div>
    </div>
  );
}
