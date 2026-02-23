import type { CapabilityProps } from "../types";
import { Dimmer } from "./Dimmer";
import { RGBGroup } from "./RGBGroup";
import { Rotation } from "./Rotation";
import { ColorWheel } from "./ColorWheel";
import { Gobo } from "./Gobo";

function assertNever(x: never): never {
  throw new Error(
    "Unhandled capability type: " + (x as { type: string }).type,
  );
}

export function CapabilityControl(props: CapabilityProps) {
  const { capability } = props;
  switch (capability.type) {
    case "dimmer":
      return <Dimmer {...props} />;
    case "rgb":
      return <RGBGroup {...props} />;
    case "pan":
    case "tilt":
      return <Rotation {...props} />;
    case "colorWheel":
      return <ColorWheel {...props} />;
    case "gobo":
      return <Gobo {...props} />;
    default:
      return assertNever(capability);
  }
}
