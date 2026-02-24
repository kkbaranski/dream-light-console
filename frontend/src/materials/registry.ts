export type SolidMaterial = {
  kind: "solid";
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
};

export type TextureMaterial = {
  kind: "texture";
  id: string;
  name: string;
  basePath: string;
  repeat: number;
};

export type MaterialDefinition = SolidMaterial | TextureMaterial;

export const floorMaterials: MaterialDefinition[] = [
  {
    kind: "texture",
    id: "interior-tiles",
    name: "Interior Tiles",
    basePath: "/textures/floors/interior-tiles/",
    repeat: 1.5,
  },
  {
    kind: "texture",
    id: "herringbone-parquet",
    name: "Herringbone Parquet",
    basePath: "/textures/floors/herringbone-parquet/",
    repeat: 1.0,
  },
  {
    kind: "texture",
    id: "concrete-pavement",
    name: "Concrete Pavement",
    basePath: "/textures/floors/concrete-pavement/",
    repeat: 1.0,
  },
  {
    kind: "texture",
    id: "laminate-floor",
    name: "Laminate Floor",
    basePath: "/textures/floors/laminate-floor/",
    repeat: 1.0,
  },
];

export const wallMaterials: MaterialDefinition[] = [
  {
    kind: "texture",
    id: "red-brick",
    name: "Red Brick",
    basePath: "/textures/walls/red-brick/",
    repeat: 1.0,
  },
  {
    kind: "texture",
    id: "floral-jacquard",
    name: "Floral Jacquard",
    basePath: "/textures/walls/floral-jacquard/",
    repeat: 1.0,
  },
  {
    kind: "texture",
    id: "painted-plaster-wall",
    name: "Painted Plaster",
    basePath: "/textures/walls/painted-plaster-wall/",
    repeat: 4.0,
  },
  {
    kind: "texture",
    id: "wood-planks-dirt",
    name: "Wood Planks",
    basePath: "/textures/walls/wood-planks-dirt/",
    repeat: 0.5,
  },
];

export function findMaterial(
  materials: MaterialDefinition[],
  id: string,
): MaterialDefinition {
  return materials.find((material) => material.id === id) ?? materials[0];
}
