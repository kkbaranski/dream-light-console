import { SectionDivider, PositionRow } from "../../components/stage/inspectorPrimitives";
import { readField, type FeatureDef } from "../feature";

export interface TransformConfig {}

export const transform: FeatureDef<TransformConfig> = {
  type: "transform",

  defaultState: () => ({ rotationX: 0, rotationY: 0, rotationZ: 0 }),

  Inspector: ({ ctx }) => {
    const sharedPosX = ctx.shared((obj) => obj.position[0]);
    const sharedPosY = ctx.shared((obj) => obj.position[1]);
    const sharedPosZ = ctx.shared((obj) => obj.position[2]);
    const sharedRotX = ctx.shared((obj) => readField<number>(obj, "rotationX", 0));
    const sharedRotY = ctx.shared((obj) => readField<number>(obj, "rotationY", 0));
    const sharedRotZ = ctx.shared((obj) => readField<number>(obj, "rotationZ", 0));

    const posX = sharedPosX ?? ctx.avgFloat((obj) => obj.position[0]);
    const posY = sharedPosY ?? ctx.avgFloat((obj) => obj.position[1]);
    const posZ = sharedPosZ ?? ctx.avgFloat((obj) => obj.position[2]);
    const rotX = sharedRotX ?? ctx.avgFloat((obj) => readField<number>(obj, "rotationX", 0), 1);
    const rotY = sharedRotY ?? ctx.avgFloat((obj) => readField<number>(obj, "rotationY", 0), 1);
    const rotZ = sharedRotZ ?? ctx.avgFloat((obj) => readField<number>(obj, "rotationZ", 0), 1);

    function updateAxis(axis: 0 | 1 | 2, value: number) {
      ctx.move(ctx.selected.map((obj) => ({
        id: obj.id,
        position: [
          axis === 0 ? value : obj.position[0],
          axis === 1 ? Math.max(0, value) : obj.position[1],
          axis === 2 ? value : obj.position[2],
        ] as [number, number, number],
      })));
    }

    return (
      <>
        <SectionDivider label="Position" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">World</span>
            <PositionRow label="X" value={posX} sensitivity={0.1} decimals={2}
              isMixed={sharedPosX === null}
              locked={ctx.isLocked("posX")} onToggleLock={() => ctx.toggleLock("posX")}
              onChange={(v) => updateAxis(0, v)} />
            <PositionRow label="Y" value={posY} min={0} sensitivity={0.1} decimals={2}
              isMixed={sharedPosY === null}
              locked={ctx.isLocked("posY")} onToggleLock={() => ctx.toggleLock("posY")}
              onChange={(v) => updateAxis(1, v)} />
            <PositionRow label="Z" value={posZ} sensitivity={0.1} decimals={2}
              isMixed={sharedPosZ === null}
              locked={ctx.isLocked("posZ")} onToggleLock={() => ctx.toggleLock("posZ")}
              onChange={(v) => updateAxis(2, v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider text-center">Rotation</span>
            <PositionRow label="X" value={rotX} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
              isMixed={sharedRotX === null}
              locked={ctx.isLocked("rotationX")} onToggleLock={() => ctx.toggleLock("rotationX")}
              onChange={(v) => ctx.update({ rotationX: v })} />
            <PositionRow label="Y" value={rotY} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
              isMixed={sharedRotY === null}
              locked={ctx.isLocked("rotationY")} onToggleLock={() => ctx.toggleLock("rotationY")}
              onChange={(v) => ctx.update({ rotationY: v })} />
            <PositionRow label="Z" value={rotZ} min={-180} max={180} sensitivity={1} decimals={1} unit="°"
              isMixed={sharedRotZ === null}
              locked={ctx.isLocked("rotationZ")} onToggleLock={() => ctx.toggleLock("rotationZ")}
              onChange={(v) => ctx.update({ rotationZ: v })} />
          </div>
        </div>
      </>
    );
  },
};
