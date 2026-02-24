import { NavLink } from "react-router-dom";

interface NavigationItem {
  to: string;
  label: string;
  disabled?: boolean;
}

const navigationItems: NavigationItem[] = [
  { to: "/stages", label: "Stages" },
  { to: "/songs", label: "Songs", disabled: true },
  { to: "/concerts", label: "Concerts", disabled: true },
  { to: "/devices", label: "Devices", disabled: true },
];

export function Sidebar() {
  return (
    <nav className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col pt-2 flex-shrink-0">
      {navigationItems.map((item) =>
        item.disabled ? (
          <div
            key={item.to}
            className="px-4 py-2.5 text-sm text-gray-600 flex items-center justify-between"
          >
            <span>{item.label}</span>
            <span className="text-xs text-gray-700">soon</span>
          </div>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "text-white bg-gray-800"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
              }`
            }
          >
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
