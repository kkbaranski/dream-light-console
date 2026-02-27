import { useStageEditorStore } from "../../store/stageEditorStore";
import { PlacedObject } from "./PlacedObject";

export function PlacedObjects() {
  const objects = useStageEditorStore((state) => state.objects);

  return (
    <>
      {objects.map((object) => (
        <PlacedObject key={object.id} object={object} />
      ))}
    </>
  );
}
