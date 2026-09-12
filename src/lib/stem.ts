/**
 * Reducing a word to the lexical item a learner would recognise.
 *
 * `abate`, `Abate`, `abated` and `abatement` are one word to someone studying
 * vocabulary, and a generator asked for a year of words will happily produce
 * several of them in different months. Exact string matching does not catch it.
 *
 * **Deliberately under-aggressive.** The cost of the two errors is not
 * symmetric: missing a collision shows the user `abate` twice, which is
 * annoying. Over-matching silently refuses a legitimately distinct word —
 * `industry` and `industrious` are worth teaching separately — and the user
 * never learns why it went missing. So every rule here stops short, and when it
 * gets something wrong the fix is a fixture entry plus a rule, not a rewrite.
 *
 * Hand-rolled rather than a dependency: the rule set is small, needs to be
 * readable by whoever debugs the next false collision, and a real Porter
 * stemmer is far more aggressive than this wants to be.
 *
 * See docs/VOCAB-GENERATION.md and docs/adr/0005-dedup-by-stem-with-retirement.md.
 */

/**
 * A suffix rule: strip `suffix`, optionally append `append`.
 *
 * `minStem` is the length the *remainder* must reach for the rule to fire. It
 * is what stops `ailing` becoming `a` and `mass` becoming `mas`. Longer is
 * safer here, which is the whole posture of this module.
 */
interface Rule {
  suffix: string;
  append?: string;
  minStem: number;
}

/**
 * Order matters: longest and most specific first, because only one rule fires.
 *
 * Each entry is a claim about English morphology that the fixture in
 * `stem.test.ts` holds us to.
 */
const RULES: Rule[] = [
  // -tion / -sion nominalisations. "abolition" → "abolit" is ugly but it is a
  // key, not a word, and it collides with "abolitionist" as intended.
  { suffix: "ations", append: "ate", minStem: 3 },
  { suffix: "ation", append: "ate", minStem: 3 },
  { suffix: "tions", append: "t", minStem: 4 },
  { suffix: "tion", append: "t", minStem: 4 },
  { suffix: "sions", append: "s", minStem: 4 },
  { suffix: "sion", append: "s", minStem: 4 },

  // -ment(s): "abatement" → "abate".
  { suffix: "ements", append: "e", minStem: 4 },
  { suffix: "ement", append: "e", minStem: 4 },
  { suffix: "ments", minStem: 5 },
  { suffix: "ment", minStem: 5 },

  // -ness, -ity, -able/-ible.
  { suffix: "inesses", append: "y", minStem: 4 },
  { suffix: "iness", append: "y", minStem: 4 },
  { suffix: "nesses", minStem: 4 },
  { suffix: "ness", minStem: 4 },
  // These must land exactly where -ible/-able land after the silent-e strip
  // below: credible -> cred, so credibility -> cred.
  { suffix: "ibilities", minStem: 3 },
  { suffix: "ibility", minStem: 3 },
  { suffix: "abilities", minStem: 3 },
  { suffix: "ability", minStem: 3 },
  { suffix: "ities", append: "ity", minStem: 3 },
  { suffix: "ity", minStem: 5 },
  { suffix: "ables", append: "e", minStem: 4 },
  { suffix: "able", append: "e", minStem: 4 },
  { suffix: "ibles", append: "e", minStem: 4 },
  { suffix: "ible", append: "e", minStem: 4 },

  // -ly. "happily" → "happy".
  { suffix: "ily", append: "y", minStem: 3 },
  { suffix: "ly", minStem: 4 },

  // -ing / -ed, with the doubled-consonant undo ("abetting" → "abet").
  { suffix: "ying", append: "y", minStem: 3 },
  { suffix: "ing", minStem: 4 },
  { suffix: "ied", append: "y", minStem: 3 },
  { suffix: "ed", minStem: 4 },

  // Plurals last: they are the shortest and would otherwise pre-empt the rest.
  { suffix: "ies", append: "y", minStem: 3 },
  { suffix: "sses", append: "ss", minStem: 3 },
  { suffix: "ches", append: "ch", minStem: 3 },
  { suffix: "shes", append: "sh", minStem: 3 },
  { suffix: "xes", append: "x", minStem: 3 },
  { suffix: "zes", append: "z", minStem: 3 },
  { suffix: "es", minStem: 4 },
  { suffix: "s", minStem: 4 },
];

/** Words whose stem is themselves. Irregulars the rules would mangle. */
const INVARIANT = new Set([
  // -ss words the plural rules would chew into nonsense.
  "abyss",
  "bias",
  "canvas",
  "chaos",
  "crisis",
  "ethos",
  "gas",
  "genius",
  "hubris",
  "iris",
  "lens",
  "mass",
  "pathos",
  "species",
  "status",
  "surplus",
  "thesis",
  "virus",
  // Words ending in a rule's suffix that are not that suffix.
  "during",
  "string",
  "spring",
  "thing",
  "king",
  "ring",
  "wing",
  "bring",
  "sting",
  "swing",
  "only",
  "reply",
  "supply",
  "apply",
  "imply",
  "comply",
  "rely",
  "fly",
  "ally",
  "rally",
  "tally",
  "folly",
  "jolly",
  "bully",
  "belly",
  "silly",
  "holy",
  "ugly",
  "early",
  "family",
  "anomaly",
  "melancholy",
  "monopoly",
  "panoply",
  "homily",
  "gadfly",
  "city",
  "pity",
  "deity",
  "unity",
  "parity",
  "laity",
  "amity",
  "comity",
  "enmity",
  "enemy",
  "bed",
  "red",
  "wed",
  "deed",
  "need",
  "feed",
  "seed",
  "greed",
  "creed",
  "breed",
  "speed",
  "proceed",
  "exceed",
  "indeed",
  "sacred",
  "wicked",
  "naked",
  "rugged",
  "crooked",
  "learned",
  "hatred",
]);

/**
 * Normalise without stemming: case, whitespace, punctuation, diacritics.
 *
 * Separate from {@link stem} because the index stores the word as written and
 * only keys on the stem — and because a caller comparing user input against a
 * displayed word wants this and not the suffix stripping.
 */
export function normalizeWord(input: string): string {
  return (
    input
      .normalize("NFD")
      // Strip combining marks: naïve → naive.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      // Surrounding quotes and punctuation, but keep internal hyphens and
      // apostrophes — "self-effacing" and "ne'er" are single lexical items.
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/[^\p{L}\p{N}]+$/u, "")
      .replace(/\s+/g, " ")
  );
}

/**
 * The collision key for a word.
 *
 * Two entries are the same word, for dedup purposes, when their stems match.
 * Returns "" for input with no letters in it, which callers should treat as
 * unusable rather than as a key.
 */
export function stem(input: string): string {
  const cached = CACHE.get(input);
  if (cached !== undefined) return cached;
  const result = computeStem(input);
  // Vocabulary is finite and small; the cap exists so a pathological caller
  // cannot grow this without bound, not because the working set is large.
  if (CACHE.size < CACHE_LIMIT) CACHE.set(input, result);
  return result;
}

/**
 * Memoised because the callers are quadratic in disguise.
 *
 * Building a 100-question exam scores every word in the corpus against every
 * question, and each score stems both sides several times — about a million
 * calls for a three-year corpus, which was 3.6 seconds of blocked main thread
 * before this cache existed. `stem` is pure, so caching it is free.
 */
const CACHE = new Map<string, string>();
const CACHE_LIMIT = 50_000;

function computeStem(input: string): string {
  const normalized = normalizeWord(input);
  if (!normalized) return "";

  // A multi-word phrase stems its last word: "ad hoc" keys on "hoc". Stemming
  // each part would make "beg the question" collide with "begging".
  const parts = normalized.split(" ");
  if (parts.length > 1) {
    return parts.slice(0, -1).concat(stem(parts[parts.length - 1])).join(" ");
  }

  if (INVARIANT.has(normalized)) return normalized;

  for (const rule of RULES) {
    if (!normalized.endsWith(rule.suffix)) continue;
    if (rule.suffix === "s" && keepsFinalS(normalized)) continue;
    const base = normalized.slice(0, normalized.length - rule.suffix.length);
    if (base.length < rule.minStem) continue;
    const candidate = base + (rule.append ?? "");
    return canonicalize(undoubleConsonant(candidate, rule));
  }

  return canonicalize(normalized);
}

/**
 * Is this an `-s` that belongs to the word rather than a plural?
 *
 * `gregarious` is not the plural of `gregariou`. Without this the `-ous`
 * adjectives — a large share of any GRE list — stem to something no other form
 * of the word produces, so `gregarious` and `gregariousness` stop colliding.
 * The Latin and Greek endings alongside it fail the same way.
 */
function keepsFinalS(word: string): boolean {
  return /(?:ss|us|is|os|as)$/.test(word);
}

/**
 * Drop a silent final `e`.
 *
 * The single most common collision failure: `abate` keeps its `e` while
 * `abated` and `abating` lose it, so the base form never matches its own
 * inflections. Stripping it from every stem puts them on the same key.
 *
 * The result is often not a word — `abat`, `obfuscat`. That is fine. This is a
 * collision key, never shown to anyone; the index keeps the word as written.
 */
function canonicalize(candidate: string): string {
  if (candidate.length >= 4 && candidate.endsWith("e")) {
    return candidate.slice(0, -1);
  }
  return candidate;
}

/**
 * `abetting` → `abett` → `abet`.
 *
 * English doubles a final consonant before `-ed`/`-ing`. Undoing it only for
 * those rules is the point: `assess` and `bless` keep their real double.
 */
function undoubleConsonant(candidate: string, rule: Rule): string {
  const inflectional = rule.suffix === "ing" || rule.suffix === "ed";
  if (!inflectional || candidate.length < 4) return candidate;

  const last = candidate[candidate.length - 1];
  const previous = candidate[candidate.length - 2];
  if (last !== previous) return candidate;
  // `ll` and `ss` are real doublings in their own right ("enthrall", "pass").
  if (last === "l" || last === "s") return candidate;
  if (!/[bcdfghjklmnpqrstvwxz]/.test(last)) return candidate;

  return candidate.slice(0, -1);
}

/** Do two words collide? */
export function sameWord(a: string, b: string): boolean {
  const left = stem(a);
  return left !== "" && left === stem(b);
}
