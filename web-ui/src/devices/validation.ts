import { encodingWidth, type BoundCapability } from "./capability";

function occupiedChannels(bound: BoundCapability): Array<{ absoluteOffset: number; label: string }> {
  const channels = bound.cap.dmxChannels?.(bound.config) ?? [];
  return channels.flatMap((channel) =>
    Array.from({ length: encodingWidth(channel.encoding) }, (_, index) => ({
      absoluteOffset: channel.offset + index,
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
        errors.push(`channel ${absoluteOffset + 1}: "${label}" collides with "${existing}"`);
      } else {
        claimedByOffset.set(absoluteOffset, label);
      }
    }
  }

  return errors;
}

export function validateMode(
  deviceLabel: string,
  modeLabel: string,
  capabilities: ReadonlyArray<BoundCapability>,
): void {
  const errors = detectCollisions(capabilities);
  if (errors.length > 0) {
    console.error(
      `DMX validation failed for "${deviceLabel}" / "${modeLabel}":\n` +
        errors.map((error) => `  • ${error}`).join("\n"),
    );
  }
}
