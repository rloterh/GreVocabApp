/**
 * Every game, as data.
 *
 * The hub, the rules card and the round builder all read from here, so adding
 * a game is a builder plus one entry — and the `GameId` union makes the
 * compiler point at anything that needs to know about it.
 *
 * Names are Lexicon's own. The section is modelled on Merriam-Webster's word
 * games, and nothing of theirs — names, art, questions — is reused
 * (docs/GAMES.md §2.4).
 */

import type { VocabWord } from "@/types";
import { buildClosest, canBuildClosest } from "./builders/closest";
import type { BuildContext } from "./context";
import type { GameId, GameQuestion, Tier } from "./types";

/** A theme token the cover is tinted with. Never a raw colour. */
export type CoverTint = "primary" | "accent" | "success" | "warning" | "secondary";

export interface GameDefinition {
  id: GameId;
  name: string;
  /** One line on the hub card. */
  blurb: string;
  /** The instruction above every question. */
  instruction: string;
  /** Seconds per question on the standard timer. */
  seconds: number;
  tint: CoverTint;
  /** The glyph the cover pattern repeats. */
  mark: string;
  /** Can this word be asked about at all? Cheap, so pools filter on it. */
  eligible: (word: VocabWord) => boolean;
  build: (word: VocabWord, ctx: BuildContext) => GameQuestion | null;
}

export const GAMES: Record<GameId, GameDefinition> = {
  closest: {
    id: "closest",
    name: "Closest Meaning",
    blurb: "Pick the word that means the same.",
    instruction: "Closest in meaning",
    seconds: 10,
    tint: "accent",
    mark: "≈",
    eligible: canBuildClosest,
    build: buildClosest,
  },
};

/** Hub order. */
export const GAME_ORDER: readonly GameId[] = ["closest"];

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
