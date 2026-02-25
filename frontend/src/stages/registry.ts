export interface StageDefinition {
  id: string;
  name: string;
  path: string;
}

export const stageDefinitions: StageDefinition[] = [
  { id: "stage-deck", name: "Stage Deck", path: "/models/stages/stage_deck.glb" },
  // { id: "concert-stage-1", name: "Concert Stage 1", path: "/models/stages/concert_stage_1.glb" },
  // { id: "concert-stage-2", name: "Concert Stage 2", path: "/models/stages/concert_stage_2.glb" },
  // { id: "concert-stage-3", name: "Concert Stage 3", path: "/models/stages/concert_stage_3.glb" },
  // { id: "concert-stage-4", name: "Concert Stage 4", path: "/models/stages/concert_stage_4.glb" },
];

export function findStageDefinition(id: string): StageDefinition | undefined {
  return stageDefinitions.find((stage) => stage.id === id);
}
