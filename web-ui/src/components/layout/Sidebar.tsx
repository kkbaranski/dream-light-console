import { NavLink } from "react-router-dom";

const navigationItems = [
  { to: "/stages", label: "Stages" },
];

export function Sidebar() {
  return (
    <nav className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col pt-2 flex-shrink-0">
      {navigationItems.map((item) => (
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
      ))}
    </nav>
  );
}
