import { api } from "../../api/client";
import { useDMXStore } from "../../store/dmxStore";

interface ChannelFaderProps {
  channel: number; // 1-indexed
  value: number;   // 0-255
}

export function ChannelFader({ channel, value }: ChannelFaderProps) {
  const setChannel = useDMXStore((state) => state.setChannel);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const newValue = Number(event.target.value);
    setChannel(channel - 1, newValue); // optimistic update
    try {
      await api.put(`/universes/1/channels/${channel}`, { value: newValue });
    } catch (error) {
      console.warn(`Failed to update channel ${channel}:`, error);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1 w-10">
      <span className="text-gray-400 text-xs">{channel}</span>
      <div className="relative h-32 flex items-center justify-center">
        <input
          type="range"
          min={0}
          max={255}
          value={value}
          onChange={(event) => void handleChange(event)}
          className="appearance-none w-28 h-2 bg-gray-700 rounded-lg cursor-pointer accent-blue-500"
          style={{ writingMode: "vertical-lr", direction: "rtl" }}
          aria-label={`Channel ${channel}`}
        />
      </div>
      <span className="text-gray-300 text-xs font-mono">{value}</span>
    </div>
  );
}
