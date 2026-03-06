import { NavLink } from "react-router-dom";
import { create } from "zustand";

export const useSidebarStore = create<{
  collapsed: boolean;
  toggle: () => void;
}>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));

const navigationItems = [
  { to: "/stages", label: "Stages", icon: "\u25A6" },
  { to: "/fixtures", label: "Fixtures", icon: "\uD83D\uDCA1" },
  { to: "/songs", label: "Songs", icon: "\u266B" },
];

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <nav
      className={`${collapsed ? "w-12" : "w-48"} bg-gray-900 border-r border-gray-800 flex flex-col pt-2 flex-shrink-0 transition-all duration-150`}
    >
      {navigationItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-4"} py-2.5 text-sm transition-colors ${
              isActive
                ? "text-white bg-gray-800"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
            }`
          }
          title={collapsed ? item.label : undefined}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          {!collapsed && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
