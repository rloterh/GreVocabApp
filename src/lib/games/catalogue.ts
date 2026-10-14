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
import { buildFact, canBuildFact } from "./builders/fact";
import { buildGap, canBuildGap } from "./builders/gap";
import { buildMatch, canBuildMatch } from "./builders/match";
import { buildOdd, canBuildOdd } from "./builders/odd";
import { buildOpposites, canBuildOpposites } from "./builders/opposites";
import { buildSpell, canBuildSpell } from "./builders/spell";
import { buildUnscramble, canBuildUnscramble } from "./builders/unscramble";
import type { BuildContext } from "./context";
import type { GameId, GameQuestion } from "./types";

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
  /**
   * Balance true and false across a round (Fact or Fiction). The round sets
   * `ctx.truth` per slot when this is on.
   */
  balanced?: boolean;
  /** Questions per round, when not ten: Match Up plays three boards. */
  length?: number;
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
  fact: {
    id: "fact",
    name: "Fact or Fiction",
    blurb: "True or false — and why.",
    instruction: "Fact or fiction?",
    seconds: 15,
    tint: "success",
    mark: "✓✗",
    balanced: true,
    eligible: canBuildFact,
    build: buildFact,
  },
  opposites: {
    id: "opposites",
    name: "Opposites",
    blurb: "Pick the opposite. Watch for the trap.",
    instruction: "Opposite in meaning",
    seconds: 10,
    tint: "warning",
    mark: "⇄",
    eligible: canBuildOpposites,
    build: buildOpposites,
  },
  gap: {
    id: "gap",
    name: "Fill the Gap",
    blurb: "Find the word the sentence is missing.",
    instruction: "Fill the gap",
    seconds: 15,
    tint: "primary",
    mark: "__",
    eligible: canBuildGap,
    build: buildGap,
  },
  odd: {
    id: "odd",
    name: "Odd One Out",
    blurb: "Three words share a meaning. Find the one that doesn’t.",
    instruction: "Odd one out",
    seconds: 12,
    tint: "secondary",
    mark: "○●",
    eligible: canBuildOdd,
    build: buildOdd,
  },
  match: {
    id: "match",
    name: "Match Up",
    blurb: "Pair five words with what they mean, against the clock.",
    instruction: "Match each word",
    seconds: 60,
    length: 3,
    tint: "accent",
    mark: "⟷",
    eligible: canBuildMatch,
    build: buildMatch,
  },
  unscramble: {
    id: "unscramble",
    name: "Unscramble",
    blurb: "Put the letters in order. Wrong tries cost only time.",
    instruction: "Unscramble the word",
    seconds: 25,
    tint: "warning",
    mark: "↻",
    eligible: canBuildUnscramble,
    build: buildUnscramble,
  },
  // Not on the hub's list: it has its own card above the games, and its
  // questions come from four of them (src/lib/games/daily.ts).
  daily: {
    id: "daily",
    name: "Daily Round",
    blurb: "Ten mixed questions. The same round for everyone today.",
    instruction: "Daily Round",
    seconds: 15,
    tint: "primary",
    mark: "◷",
    eligible: () => false,
    build: () => null,
  },
  spell: {
    id: "spell",
    name: "Spell It",
    blurb: "Hear it, read what it means, spell it.",
    instruction: "Spell the word",
    seconds: 20,
    tint: "success",
    mark: "abc",
    eligible: canBuildSpell,
    build: buildSpell,
  },
};


// Labels live in names.ts so screens that only show names — the Progress
// page — need not import every builder.
export { GAME_NAMES, GAME_ORDER, TIER_DESCRIPTION, TIER_LABEL, TIER_ORDER } from "./names";
