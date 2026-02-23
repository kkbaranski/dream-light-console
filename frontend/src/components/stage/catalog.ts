import type { Stage3DObjectType } from "../../store/stage3dStore";

export interface CatalogItem {
  type: Stage3DObjectType;
  label: string;
  description: string;
  category: "Lights" | "Stage" | "Structure" | "Effects";
  icon: string;
  defaultElevation: number;
  defaults: {
    width?: number;
    depth?: number;
    thickness?: number;
    length?: number;
    segments?: number;
  };
}

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    type: "moving_head",
    label: "Moving Head",
    description: "Pan/tilt beam fixture",
    category: "Lights",
    icon: "🎯",
    defaultElevation: 0,
    defaults: {},
  },
  {
    type: "par_can",
    label: "PAR Can",
    description: "Fixed wash light",
    category: "Lights",
    icon: "💡",
    defaultElevation: 0,
    defaults: {},
  },
  {
    type: "led_bar",
    label: "LED Bar",
    description: "Linear LED strip",
    category: "Lights",
    icon: "▬",
    defaultElevation: 0,
    defaults: { length: 1.5, segments: 5 },
  },
  {
    type: "stage_platform",
    label: "Stage Platform",
    description: "Raised stage deck",
    category: "Stage",
    icon: "⬛",
    defaultElevation: 0,
    defaults: { width: 2, depth: 2, thickness: 0.4 },
  },
  {
    type: "truss_beam",
    label: "Truss Beam",
    description: "Overhead lighting truss",
    category: "Structure",
    icon: "🔩",
    defaultElevation: 4,
    defaults: { length: 3 },
  },
  {
    type: "smoke_machine",
    label: "Smoke Machine",
    description: "Atmospheric haze generator",
    category: "Effects",
    icon: "💨",
    defaultElevation: 0,
    defaults: {},
  },
];

export const CATEGORIES = ["Lights", "Stage", "Structure", "Effects"] as const;

export function getCatalogItem(type: Stage3DObjectType): CatalogItem {
  return CATALOG_ITEMS.find((i) => i.type === type) ?? CATALOG_ITEMS[0];
}
