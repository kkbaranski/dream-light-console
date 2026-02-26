import { useStageEditorStore, isLight, type LightObject } from "../../store/stageEditorStore";
import { MovingHead } from "./MovingHead";

export function PlacedLights() {
  const objects = useStageEditorStore((s) => s.objects);
  const lights = objects.filter(isLight) as LightObject[];

  return (
    <>
      {lights.map((light) => {
        if (light.type === "moving_head") return <MovingHead key={light.id} light={light} />;
        return null;
      })}
    </>
  );
}
