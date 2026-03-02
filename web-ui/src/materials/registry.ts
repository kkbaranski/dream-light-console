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
  // Textures
  { kind: "texture", id: "floor-pavement", name: "Floor Pavement", basePath: "/textures/floors/floor-pavement/", repeat: 15.0 },
  { kind: "texture", id: "interior-tiles",      name: "Interior Tiles",     basePath: "/textures/floors/interior-tiles/",      repeat: 5 },
  { kind: "texture", id: "herringbone-parquet",  name: "Herringbone Parquet", basePath: "/textures/floors/herringbone-parquet/", repeat: 10 },
  { kind: "texture", id: "concrete-pavement",    name: "Concrete Pavement",  basePath: "/textures/floors/concrete-pavement/",   repeat: 5 },
  { kind: "texture", id: "laminate-floor",       name: "Laminate Floor",     basePath: "/textures/floors/laminate-floor/",      repeat: 5 },
  // Solids
  { kind: "solid", id: "floor-black",      name: "Black",      color: "#111111", roughness: 0.8,  metalness: 0 },
  { kind: "solid", id: "floor-dark-grey",  name: "Dark Grey",  color: "#2d2d2d", roughness: 0.7,  metalness: 0 },
  { kind: "solid", id: "floor-grey",       name: "Grey",       color: "#666666", roughness: 0.6,  metalness: 0 },
  { kind: "solid", id: "floor-white",      name: "White",      color: "#f0f0f0", roughness: 0.5,  metalness: 0 },
  { kind: "solid", id: "floor-dark-wood",  name: "Dark Wood",  color: "#3d2314", roughness: 0.65, metalness: 0 },
  { kind: "solid", id: "floor-stage-red",  name: "Stage Red",  color: "#7a1818", roughness: 0.7,  metalness: 0 },
];

export const wallMaterials: MaterialDefinition[] = [
  // Textures
  { kind: "texture", id: "red-brick2",           name: "Red Brick 2",       basePath: "/textures/walls/red-brick2/",           repeat: 10 },
  { kind: "texture", id: "red-brick",           name: "Red Brick",       basePath: "/textures/walls/red-brick/",           repeat: 2.0 },
  { kind: "texture", id: "floral-jacquard",      name: "Floral Jacquard", basePath: "/textures/walls/floral-jacquard/",     repeat: 1.0 },
  { kind: "texture", id: "painted-plaster-wall", name: "Painted Plaster", basePath: "/textures/walls/painted-plaster-wall/", repeat: 4.0 },
  { kind: "texture", id: "wood-planks-dirt",     name: "Wood Planks",     basePath: "/textures/walls/wood-planks-dirt/",    repeat: 0.5 },
  // Solids
  { kind: "solid", id: "wall-white",       name: "White",       color: "#f2f2f2", roughness: 0.9,  metalness: 0 },
  { kind: "solid", id: "wall-off-white",   name: "Off White",   color: "#e8e0d5", roughness: 0.85, metalness: 0 },
  { kind: "solid", id: "wall-light-grey",  name: "Light Grey",  color: "#cccccc", roughness: 0.8,  metalness: 0 },
  { kind: "solid", id: "wall-dark-grey",   name: "Dark Grey",   color: "#444444", roughness: 0.7,  metalness: 0 },
  { kind: "solid", id: "wall-black",       name: "Black",       color: "#111111", roughness: 0.8,  metalness: 0 },
  { kind: "solid", id: "wall-burgundy",    name: "Burgundy",    color: "#5c1a1a", roughness: 0.75, metalness: 0 },
];

export function findMaterial(
  materials: MaterialDefinition[],
  id: string,
): MaterialDefinition {
  return materials.find((material) => material.id === id) ?? materials[0];
}
