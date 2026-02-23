import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "⊞" },
  { to: "/stage", label: "Stage Editor", icon: "◫" },
  { to: "/fixtures", label: "Fixtures", icon: "💡", comingSoon: true },
  { to: "/scenes", label: "Scenes", icon: "🎬" },
];

export function Sidebar() {
  return (
    <nav className="w-56 bg-gray-900 border-r border-gray-700 flex flex-col py-4">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
              isActive
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            } ${item.comingSoon ? "opacity-50 pointer-events-none" : ""}`
          }
        >
          <span className="text-base">{item.icon}</span>
          <span>{item.label}</span>
          {item.comingSoon && (
            <span className="ml-auto text-xs text-gray-500">soon</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
