/**
 * A Picture It round: ten parts, at most two from any one diagram, each with
 * three other parts of the same object as its wrong answers.
 *
 * Same-object options are the point. "Which part of the house is this?" with
 * *eave*, *lintel* and *bargeboard* beside the answer is a real question;
 * with *keel* and *iris* it is a matching exercise. No distractor scorer is
 * needed, and none would do better.
 *
 * Not tied to a track: these are general words, and none of them is in a
 * notebook, so a round never offers to send anything to Flashcards.
 */

import { seededRandom, seededShuffle } from "@/lib/order";
import type { PictureQuestion } from "../types";
import { DIAGRAMS } from "./diagrams";

export const PICTURE_ROUND_LENGTH = 10;
const PER_DIAGRAM = 2;

export function buildPictureRound(seed: number, length = PICTURE_ROUND_LENGTH): PictureQuestion[] {
  const random = seededRandom(seed);
  const all = DIAGRAMS.flatMap((d) => d.parts.map((p) => ({ d, p })));
  const order = seededShuffle(all, seed);
  const used = new Map<string, number>();
  const out: PictureQuestion[] = [];

  for (const { d, p } of order) {
    if (out.length === length) break;
    if ((used.get(d.id) ?? 0) >= PER_DIAGRAM) continue;
    const others = seededShuffle(
      d.parts.filter((x) => x.id !== p.id).map((x) => x.name),
      Math.floor(random() * 2 ** 31),
    ).slice(0, 3);
    if (others.length < 3) continue;
    const options = seededShuffle([p.name, ...others], Math.floor(random() * 2 ** 31));
    used.set(d.id, (used.get(d.id) ?? 0) + 1);
    out.push({
      kind: "picture",
      wordId: `pic-${d.id}-${p.id}`,
      word: p.name,
      partOfSpeech: "noun",
      diagram: d.id,
      part: p.id,
      options,
      answer: options.indexOf(p.name),
      explain: { definition: p.definition, example: "" },
    });
  }
  return out;
}

export function diagramById(id: string) {
  return DIAGRAMS.find((d) => d.id === id);
}
