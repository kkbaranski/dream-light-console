import { useStageEditorStore, isLight, type LightObject } from "../../store/stageEditorStore";
import { MovingHead } from "./MovingHead";

export function PlacedLights() {
  // Select the stable `objects` reference; filtering here is fine because
  // the selector returns the same array reference when nothing changed.
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
