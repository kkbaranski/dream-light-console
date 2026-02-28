import * as THREE from "three";
import { getCachedNode, readField, type CapabilityDef } from "../capability";
import { ValueSlider, SectionDivider } from "../../components/stage/inspectorPrimitives";

export interface InnerPoleConfig {
  readonly nodeName: string;
}

function initPoleNode(model: THREE.Group, node: THREE.Object3D): void {
  node.userData._restY = node.position.y;
  const box = new THREE.Box3().setFromObject(model);
  node.userData._maxExtension = box.getSize(new THREE.Vector3()).y * 0.5;
}

export const innerPole: CapabilityDef<InnerPoleConfig> = {
  type: "innerPole",

  defaultState: () => ({ height: 0 }),

  applyToModel: (model, obj, config) => {
    const node = getCachedNode(model, config.nodeName);
    if (!node) return;

    if (node.userData._restY === undefined) {
      initPoleNode(model, node);
    }

    const restY        = node.userData._restY        as number;
    const maxExtension = node.userData._maxExtension as number;
    const height       = readField<number>(obj, "height", 0);

    node.position.y = restY + height * maxExtension;
  },

  Inspector: ({ ctx }) => (
    <>
      <SectionDivider label="Pole Height" />
      <ValueSlider
        label="Extension"
        value={Math.round(readField<number>(ctx.selected[0], "height", 0) * 100)}
        min={0} max={100} unit="%"
        onChange={(v) => ctx.update({ height: v / 100 })}
      />
    </>
  ),
};
