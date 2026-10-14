/**
 * Game and tier names, with no builders attached.
 *
 * The catalogue imports every question builder. A screen that only needs to
 * say "Closest Meaning · Standard" — the Progress page, the Dashboard —
 * imports this instead and stays out of the games bundle.
 */

import type { GameId, Tier } from "./types";

export const GAME_NAMES: Record<GameId, string> = {
  closest: "Closest Meaning",
  fact: "Fact or Fiction",
  opposites: "Opposites",
  gap: "Fill the Gap",
  odd: "Odd One Out",
  match: "Match Up",
  spell: "Spell It",
  daily: "Daily Round",
};

/** Hub order. The Daily Round is not in it: it has its own card. */
export const GAME_ORDER: readonly GameId[] = ["closest", "fact", "opposites", "gap", "odd", "match", "spell"];

export const TIER_LABEL: Record<Tier, string> = {
  warmup: "Warm-up",
  standard: "Standard",
  hard: "Hard",
  fiendish: "Fiendish",
  mine: "Mine",
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  warmup: "The first third of this track",
  standard: "The middle third",
  hard: "The final third",
  fiendish: "The final third, trickier options, less time",
  mine: "Words you've studied",
};

/** Hub and rules card display order. */
export const TIER_ORDER: readonly Tier[] = ["warmup", "standard", "hard", "fiendish", "mine"];
