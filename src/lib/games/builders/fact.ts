/**
 * Fact or Fiction: one statement about a word, true or false.
 *
 * The reference app's version is general trivia. This one is always about a
 * word, and always explains itself: the definition and example, plus — for a
 * false statement — what was swapped in ("That is the meaning of
 * *loquacious*"). The explanation is the learning moment, so the stage holds
 * the clock while it is read.
 *
 * Templates, by tier:
 *
 * | Template | True | False | From |
 * | --- | --- | --- | --- |
 * | means    | its own definition | a guarded distractor's definition | Warm-up |
 * | synonym  | its best synonym   | its best antonym                  | Warm-up |
 * | opposite | its best antonym   | its best synonym                  | Standard |
 * | root     | a curated family member | a member of another family   | Hard |
 *
 * A false statement is always *clearly* false — a definition from a word the
 * meaning guard keeps well apart, or the opposite relation outright — so the
 * game tests the word, never a technicality.
 *
 * The round decides each slot's truth (`ctx.truth`) so a round is balanced;
 * this builder honours it or returns null.
 *
 * See docs/GAMES.md §4.2.
 */

import type { VocabWord } from "@/types";
import { pickDistractors } from "@/lib/distractors";
import { familiesOf, ROOT_FAMILIES } from "@/lib/roots";
import { normalizeWord, stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  definitionStems,
  isConfirmed,
  isSafeSynonymSource,
  meaningNeighbourhood,
  rankedAntonyms,
  rankedSynonyms,
} from "../relations";
import { asClause, displayWord } from "../text";
import type { Tier, VerdictQuestion } from "../types";
import { VERDICT_OPTIONS } from "../types";

type Template = "means" | "synonym" | "opposite" | "root";

const TEMPLATES_BY_TIER: Record<Tier, readonly Template[]> = {
  warmup: ["means", "synonym"],
  standard: ["means", "synonym", "opposite"],
  mine: ["means", "synonym", "opposite"],
  hard: ["means", "synonym", "opposite", "root"],
  fiendish: ["means", "synonym", "opposite", "root"],
};

const CANDIDATES = 30;

export function canBuildFact(word: VocabWord): boolean {
  return Boolean(word.definition.trim());
}

export function buildFact(word: VocabWord, ctx: BuildContext): VerdictQuestion | null {
  const truth = ctx.truth ?? ctx.random() < 0.5;
  const templates = [...TEMPLATES_BY_TIER[ctx.tier]];
  // Try templates in a random order, so a round mixes them.
  for (let i = templates.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [templates[i], templates[j]] = [templates[j]!, templates[i]!];
  }
  for (const template of templates) {
    const made = BUILD[template](word, truth, ctx);
    if (made) {
      return {
        kind: "verdict",
        wordId: word.id,
        word: displayWord(word.word),
        partOfSpeech: word.partOfSpeech,
        statement: made.statement,
        options: [...VERDICT_OPTIONS],
        answer: truth ? 0 : 1,
        explain: { definition: word.definition, example: word.example, note: made.note },
      };
    }
  }
  return null;
}

type Made = { statement: string; note?: string } | null;

/**
 * "“x” means <definition>." — except for a definition written as
 * "Describing …", which reads wrongly after "means" ("deciduous means
 * describing trees…", found by a blind read). That becomes "“x” describes …".
 */
function meansStatement(w: string, definition: string): string {
  const clause = asClause(definition);
  const describing = clause.match(/^describing\s+(.*)$/i);
  return describing ? `${q(w)} describes ${describing[1]}.` : `${q(w)} means ${clause}.`;
}

function confirmedSynonym(word: VocabWord, ctx: BuildContext): string | undefined {
  return rankedSynonyms(ctx.index, word).find((s) => isConfirmed(ctx.index, word, s, "synonym"));
}

function confirmedAntonym(word: VocabWord, ctx: BuildContext): string | undefined {
  return rankedAntonyms(ctx.index, word).find((a) => isConfirmed(ctx.index, word, a, "antonym"));
}

const q = (w: string) => `“${w}”`;

const BUILD: Record<Template, (word: VocabWord, truth: boolean, ctx: BuildContext) => Made> = {
  means(word, truth, ctx) {
    const w = displayWord(word.word);
    if (truth) return { statement: meansStatement(w, word.definition) };
    // A definition borrowed from a word kept well clear of this one's meaning,
    // and of the same part of speech, so the grammar cannot give it away.
    const neighbourhood = meaningNeighbourhood(ctx.index, word);
    const own = definitionStems(word.definition);
    const candidates = pickDistractors(word, { pool: ctx.pool, random: ctx.random }, CANDIDATES);
    const other = candidates.find(
      (c) =>
        normalizeWord(c.partOfSpeech) === normalizeWord(word.partOfSpeech) &&
        isSafeSynonymSource(ctx.index, neighbourhood, c, own),
    );
    if (!other) return null;
    return {
      statement: meansStatement(w, other.definition),
      note: `That is the meaning of ${q(displayWord(other.word))}.`,
    };
  },

  // The relation templates state a pair as plain fact, so the pair must be
  // confirmed by both cards; one list's entry is too weak (blind read, seed 4:
  // *dread* "opposite of" anticipate, *paragon* of imperfection).
  synonym(word, truth, ctx) {
    const w = displayWord(word.word);
    const partner = truth ? confirmedSynonym(word, ctx) : confirmedAntonym(word, ctx);
    if (!partner) return null;
    return {
      statement: `${q(w)} and ${q(partner)} mean nearly the same thing.`,
      note: truth ? undefined : `${q(partner)} means nearly the opposite of ${q(w)}.`,
    };
  },

  opposite(word, truth, ctx) {
    const w = displayWord(word.word);
    const partner = truth ? confirmedAntonym(word, ctx) : confirmedSynonym(word, ctx);
    if (!partner) return null;
    return {
      statement: `${q(w)} is the opposite of ${q(partner)}.`,
      note: truth ? undefined : `${q(partner)} means nearly the same as ${q(w)}.`,
    };
  },

  root(word, truth, ctx) {
    const families = familiesOf(word.word);
    if (families.length === 0) return null;
    const w = displayWord(word.word);
    const self = normalizeWord(word.word);
    const family = families[Math.floor(ctx.random() * families.length)]!;
    if (truth) {
      const others = family.members.filter((m) => normalizeWord(m) !== self);
      if (others.length === 0) return null;
      const partner = others[Math.floor(ctx.random() * others.length)]!;
      return {
        statement: `${q(w)} and ${q(partner)} share a root.`,
        note: `Both come from ${family.root}, ${family.origin} for “${family.meaning}”.`,
      };
    }
    // A member of a family this word is not in — and that shares no family
    // with it either way, since some words belong to two.
    const mine = new Set(families.map((f) => f.root));
    const elsewhere = ROOT_FAMILIES.filter((f) => !mine.has(f.root));
    if (elsewhere.length === 0) return null;
    const other = elsewhere[Math.floor(ctx.random() * elsewhere.length)]!;
    const candidates = other.members.filter(
      (m) => familiesOf(m).every((f) => !mine.has(f.root)) && stem(m) !== stem(word.word),
    );
    if (candidates.length === 0) return null;
    const partner = candidates[Math.floor(ctx.random() * candidates.length)]!;
    return {
      statement: `${q(w)} and ${q(partner)} share a root.`,
      note: `${q(w)} comes from ${family.root} (“${family.meaning}”); ${q(partner)} from ${other.root} (“${other.meaning}”).`,
    };
  },
};
