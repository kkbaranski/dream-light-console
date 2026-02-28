import { encodingWidth, type BoundCapability, type FixtureMode } from "./capability";

function occupiedChannels(bound: BoundCapability): Array<{ absoluteOffset: number; label: string }> {
  if (bound.channelOffset === undefined) return [];

  const channels = bound.cap.dmxChannels?.(bound.config) ?? [];
  return channels.flatMap((channel) =>
    Array.from({ length: encodingWidth(channel.encoding) }, (_, index) => ({
      absoluteOffset: bound.channelOffset! + channel.offset + index,
      label: channel.label,
    })),
  );
}

function detectCollisions(capabilities: ReadonlyArray<BoundCapability>): string[] {
  const claimedByOffset = new Map<number, string>();
  const errors: string[] = [];

  for (const bound of capabilities) {
    for (const { absoluteOffset, label } of occupiedChannels(bound)) {
      const existing = claimedByOffset.get(absoluteOffset);
      if (existing !== undefined) {
        errors.push(`offset ${absoluteOffset}: "${label}" collides with "${existing}"`);
      } else {
        claimedByOffset.set(absoluteOffset, label);
      }
    }
  }

  return errors;
}

function validateMode(deviceLabel: string, mode: FixtureMode): void {
  const errors = detectCollisions(mode.capabilities);
  if (errors.length > 0) {
    console.error(
      `DMX validation failed for "${deviceLabel}" mode "${mode.label}":\n` +
        errors.map((error) => `  • ${error}`).join("\n"),
    );
  }
}

export function validateRegistry(
  registry: Record<string, { label: string; modes: ReadonlyArray<FixtureMode> }>,
): void {
  for (const def of Object.values(registry)) {
    for (const mode of def.modes) {
      validateMode(def.label, mode);
    }
  }
}
