import type { VocabWord } from "@/types";
import type { RelationIndex } from "./relations";
import type { Tier } from "./types";

/** What a builder needs besides the word it is asking about. */
export interface BuildContext {
  /** Every word that may supply a wrong answer. */
  pool: readonly VocabWord[];
  /** The relation graph over `pool`. Built once per round, not per question. */
  index: RelationIndex;
  /** wordId → month key, for the distractor scorer's same-register bonus. */
  monthOf: Record<string, string>;
  tier: Tier;
  random: () => number;
}
