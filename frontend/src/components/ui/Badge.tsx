import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: "green" | "red" | "yellow" | "gray";
}

export function Badge({ children, color = "gray" }: BadgeProps) {
  const colors = {
    green: "bg-green-500 text-white",
    red: "bg-red-500 text-white",
    yellow: "bg-yellow-400 text-gray-900",
    gray: "bg-gray-600 text-gray-100",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  );
}
