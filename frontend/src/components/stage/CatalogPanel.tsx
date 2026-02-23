import { useState } from "react";
import { CATALOG_ITEMS, CATEGORIES } from "./catalog";
import type { Stage3DObjectType } from "../../store/stage3dStore";

export function CatalogPanel() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  return (
    <aside className="w-48 flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-gray-700">
        <span className="text-gray-300 text-xs font-semibold uppercase tracking-wider">
          Stage Builder
        </span>
      </div>

      {CATEGORIES.map((cat) => {
        const items = CATALOG_ITEMS.filter((i) => i.category === cat);
        const isOpen = !collapsed[cat];

        return (
          <div key={cat} className="border-b border-gray-800">
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              onClick={() => toggleCategory(cat)}
            >
              <span className="font-medium">{cat}</span>
              <span className="text-gray-600">{isOpen ? "▾" : "▸"}</span>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {items.map((item) => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "stage3d/type",
                        item.type as Stage3DObjectType,
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 cursor-grab active:cursor-grabbing select-none"
                    title={item.description}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
