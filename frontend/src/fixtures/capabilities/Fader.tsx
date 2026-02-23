interface FaderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export function Fader({ label, value, onChange }: FaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className="text-gray-300 text-xs font-mono w-8 text-right">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg cursor-pointer accent-blue-500"
        style={{ backgroundColor: "#374151" }}
      />
    </div>
  );
}
