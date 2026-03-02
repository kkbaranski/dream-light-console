import * as THREE from "three";
import { getCachedNode, readField, type CapabilityDef, type CapObject } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface InnerPoleConfig {
  readonly modelNode: string;
}

function initPoleNode(model: THREE.Group, poleNode: THREE.Object3D): void {
  poleNode.userData._restY = poleNode.position.y;
  const box = new THREE.Box3().setFromObject(model);
  poleNode.userData._maxExtension = box.getSize(new THREE.Vector3()).y * 0.5;
}

export const innerPole: CapabilityDef<InnerPoleConfig> = {
  type: "innerPole",

  defaultState: () => ({ height: 0 }),

  applyToModel: (model, obj, config) => {
    const poleNode = getCachedNode(model, config.modelNode);
    if (!poleNode) return;

    if (poleNode.userData._restY === undefined) {
      initPoleNode(model, poleNode);
    }

    const restY        = poleNode.userData._restY        as number;
    const maxExtension = poleNode.userData._maxExtension as number;

    poleNode.position.y = restY + readField<number>(obj, "height", 0) * maxExtension;
  },

  Inspector: ({ ctx }) => {
    const getPercent = (obj: CapObject) => Math.round(readField<number>(obj, "height", 0) * 100);
    return (
      <>
        <SectionDivider label="Pole Height" />
        <ValueSlider
          label="Extension"
          value={ctx.shared(getPercent) ?? ctx.avgInt(getPercent)}
          isMixed={ctx.isMixed((obj) => readField<number>(obj, "height", 0))}
          min={0} max={100} unit="%"
          locked={ctx.isLocked("height")}
          onToggleLock={() => ctx.toggleLock("height")}
          onChange={(v) => ctx.update({ height: v / 100 })}
        />
      </>
    );
  },
};
