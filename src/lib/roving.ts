/**
 * Arrow-key movement within a group of buttons.
 *
 * Tab moves between groups; the arrows move within one, which is what a
 * keyboard user expects of a list of choices and what keeps a five-word
 * column from costing five Tabs. Disabled entries — a word already paired —
 * are skipped. Movement stops at the ends rather than wrapping: a list that
 * wraps hides where it ends.
 */

export type RovingKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function isRovingKey(key: string): key is RovingKey {
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(key);
}

/**
 * Where focus should go: an index into `enabled`, or null to stay put.
 * `current` is the focused entry's index, -1 if focus is not in the group.
 */
export function rovingTarget(enabled: readonly boolean[], current: number, key: RovingKey): number | null {
  const live = enabled.flatMap((on, i) => (on ? [i] : []));
  if (live.length === 0) return null;
  if (key === "Home") return live[0]!;
  if (key === "End") return live[live.length - 1]!;
  const forward = key === "ArrowDown" || key === "ArrowRight";
  if (current < 0) return forward ? live[0]! : live[live.length - 1]!;
  const next = forward ? live.find((i) => i > current) : [...live].reverse().find((i) => i < current);
  return next ?? null;
}
