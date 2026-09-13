/**
 * Build a multi-year vocabulary corpus for one track.
 *
 * Two stages, deliberately separated:
 *
 * 1. **Selection.** Ask for the *words* only — cheap, fast, and the part that
 *    decides whether the corpus is any good. Everything is deduplicated
 *    against everything else using the app's own stemmer before a single card
 *    is written, so no effort is spent on a word that will be thrown away.
 * 2. **Cards.** Definitions, examples and mnemonics for the words that
 *    survived, in small batches, each checked by the app's own quality rules
 *    and repaired once where they fail.
 *
 * Running selection first is what makes the result worth having: a duplicate
 * discovered after its card was written has cost a card's worth of generation,
 * and at this scale that is most of the run.
 *
 * Uses the `claude` CLI already on PATH — the installed-CLI route from
 * ADR 0009. No API key, and nothing leaves the machine that the user's own
 * tool would not already send.
 *
 * Uniqueness is enforced **within a track and deliberately not across them**.
 * The SAT and GRE vocabularies genuinely overlap, and forcing them apart would
 * strip SAT of exactly the words its candidates need most while pushing GRE
 * toward obscurity. See docs/adr/0013-cross-track-overlap.md.
 *
 * Usage:
 *   npx tsx scripts/generate-corpus.ts --track sat --months 36 --out public/vocab
 */

import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { stem } from "../src/lib/stem";
import { checkWord } from "../src/lib/word-quality";
import { isTrack, wordId } from "../src/lib/track";
import type { Track, VocabMonth, VocabWord } from "../src/types";

const WORDS_PER_DAY = 3;
const DAYS_PER_MONTH = 30;
const PER_MONTH = WORDS_PER_DAY * DAYS_PER_MONTH;

/** Cards per request. Small enough to stay reliable, large enough to be quick. */
const CARD_BATCH = 15;

/**
 * The shape of the corpus.
 *
 * Three years is long enough that "GRE words" stops being a single category.
 * Bands keep month 30 from being 90 more of month 3, and give the difficulty
 * curve something real to climb.
 */
interface Band {
  name: string;
  through: number;
  brief: string;
}

const GRE_BANDS: Band[] = [
  {
    name: "core high-frequency",
    through: 12,
    brief:
      "the highest-frequency GRE words — the ones that appear on real tests again and again. Common enough that an educated reader has met them, hard enough that most test-takers cannot define them precisely.",
  },
  {
    name: "mid-frequency and academic register",
    through: 24,
    brief:
      "solid mid-frequency GRE vocabulary: the academic register of serious journalism, criticism and scholarly writing. Less common than the core list but not obscure.",
  },
  {
    name: "advanced and low-frequency",
    through: 36,
    brief:
      "advanced, lower-frequency GRE vocabulary — genuinely difficult words that still earn their place: they appear in demanding prose and have no plain-English equivalent. Not archaic curiosities, not words nobody has written since 1890.",
  },
];

/**
 * SAT is a level below GRE, not a subset of it.
 *
 * The overlap between the two is real and welcome (ADR 0013), but the target
 * reader is different: someone finishing secondary school and reading serious
 * nonfiction for the first time, not a graduate. The bands are written around
 * what the test actually asks — words in context, and questions about how a
 * passage argues — rather than around raw rarity.
 */
const SAT_BANDS: Band[] = [
  {
    name: "core academic",
    through: 12,
    brief:
      "the highest-utility SAT vocabulary: words a strong high-school reader is reaching for and meets constantly in essays, editorials and set texts. Common enough to be worth knowing cold, precise enough that most students could not define them exactly.",
  },
  {
    name: "argument and evidence",
    through: 24,
    brief:
      "the vocabulary of how a text works — tone, stance, claim, evidence, qualification, concession. The SAT asks about an author's purpose and method more than about rare words, and this is the register those questions are written in.",
  },
  {
    name: "advanced literary and scientific",
    through: 36,
    brief:
      "the hardest tier still fair on an SAT: demanding words from literary fiction and from science and history passages. Difficult but not obscure — every one should appear in prose a motivated seventeen-year-old might actually be handed.",
  },
];

const BANDS_BY_TRACK: Record<Track, Band[]> = {
  gre: GRE_BANDS,
  sat: SAT_BANDS,
};

/**
 * What level to aim at, said separately from what subject to cover.
 *
 * The first SAT corpus overlapped the GRE one by 59% where ADR 0013 expected
 * about a third. Part of that is the register genuinely converging, and that
 * part is welcome. The rest was an artefact: the model only ever saw
 * same-track exclusions, so nothing pulled it away from vocabulary it had
 * already reached for, and "SAT vocabulary" alone turned out not to be enough
 * of a steer.
 *
 * This is the lever ADR 0013 names — the prompt, not a dedup rule. It moves
 * where the distribution sits without forbidding a single word, because a word
 * that belongs on both lists is not a mistake.
 */
const REGISTER_BY_TRACK: Record<Track, string[]> = {
  gre: [],
  sat: [
    "Aim at the level, not only the subject:",
    "- Prefer words that earn their place in a high-school reading list, an",
    "  editorial, or an SAT passage over words whose natural home is graduate",
    "  academic prose.",
    "- If a word is far more likely to be tested on the GRE than on the SAT,",
    "  skip it and pick something a strong sixteen-year-old would more",
    "  plausibly meet. Words that genuinely belong on both lists are welcome —",
    "  this is about where the centre of the list sits, not about avoiding",
    "  overlap.",
    "- A useful test: could this word appear, unglossed, in a serious newspaper",
    "  a teenager might read? If only a specialist would write it, it is too",
    "  far.",
  ],
};

/** Themes, so a month reads as a unit rather than an alphabetical slice. */
const GRE_THEMES = [
  "criticism and praise", "certainty and doubt", "speech and silence",
  "change and permanence", "abundance and scarcity", "concealment and disclosure",
  "temperament and disposition", "conflict and reconciliation", "judgement and discernment",
  "deception and candour", "power and submission", "order and disorder",
  "argument and persuasion", "emotion and restraint", "time and duration",
  "knowledge and ignorance", "beginnings and endings", "movement and stillness",
  "generosity and stinginess", "clarity and obscurity", "wealth and poverty",
  "courage and cowardice", "harmony and discord", "growth and decay",
  "law and transgression", "ritual and custom", "art and artifice",
  "nature and cultivation", "reason and unreason", "memory and forgetting",
  "sincerity and pretence", "excess and moderation", "solitude and society",
  "fortune and misfortune", "labour and idleness", "vision and blindness",
];

/**
 * SAT themes, oriented to what the test reads rather than to abstractions.
 *
 * Its passages are literature, history documents, social science and natural
 * science, and its questions are about tone, claim and evidence. Themes drawn
 * from that produce a more useful list than the GRE set would, even though
 * the two corpora may share plenty of individual words.
 */
const SAT_THEMES = [
  "describing character", "tone and attitude", "claims and evidence",
  "cause and effect", "comparison and contrast", "change over time",
  "problems and solutions", "belief and scepticism", "praise and criticism",
  "certainty and hedging", "persuasion and rhetoric", "clarity and confusion",
  "science and experiment", "nature and environment", "society and community",
  "government and citizenship", "history and memory", "conflict and cooperation",
  "work and ambition", "wealth and inequality", "education and learning",
  "technology and invention", "art and expression", "tradition and reform",
  "identity and belonging", "freedom and restriction", "risk and caution",
  "growth and decline", "leadership and influence", "truth and misinformation",
  "emotion and composure", "humour and irony", "isolation and connection",
  "justice and fairness", "migration and place", "discovery and exploration",
];

const THEMES_BY_TRACK: Record<Track, string[]> = {
  gre: GRE_THEMES,
  sat: SAT_THEMES,
};

interface Options {
  months: number;
  /** First teaching position to write, 1-based. */
  start: number;
  out: string;
  only?: number;
  track: Track;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const requested = get("--track", "gre");
  if (!isTrack(requested)) {
    console.error(`--track must be one of gre, sat (got "${requested}")`);
    process.exit(1);
  }
  return {
    months: Number(get("--months", "36")),
    // Where in the track to start. Not a date: the corpus has no calendar in
    // it, and when a user studies month 7 is their schedule's business.
    start: Number(get("--start", "1")),
    out: get("--out", "public/vocab"),
    only: args.includes("--only") ? Number(get("--only", "1")) : undefined,
    // Narrowed by the isTrack guard above; process.exit is `never`.
    track: requested,
  };
}

/** Run the CLI and return its stdout. */
function ask(prompt: string, timeoutMs = 600_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p"], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.slice(0, 400) || `exited ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Pull the first JSON array or object out of a reply. */
function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  // Walk to the matching close, so trailing prose does not break the parse.
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error(`unterminated JSON in reply: ${text.slice(0, 200)}`);
}

/** `01`, `02`, ... — the filename for a teaching position. */
function fileFor(ordinal: number): string {
  return `${String(ordinal).padStart(2, "0")}.json`;
}

function bandFor(track: Track, monthIndex: number) {
  const bands = BANDS_BY_TRACK[track];
  return bands.find((b) => monthIndex < b.through) ?? bands[bands.length - 1];
}

function themeFor(track: Track, monthIndex: number): string {
  const themes = THEMES_BY_TRACK[track];
  return themes[monthIndex % themes.length];
}

/** Stage 1: the word list for one month, filtered against everything so far. */
async function selectWords(
  track: Track,
  monthIndex: number,
  seen: Map<string, string>,
): Promise<string[]> {
  const band = bandFor(track, monthIndex);
  const theme = themeFor(track, monthIndex);
  const kept: string[] = [];

  // Ask for a generous overage: the dedup filter is local and unforgiving.
  for (let round = 0; round < 3 && kept.length < PER_MONTH; round++) {
    const need = PER_MONTH - kept.length;
    const avoid = [...seen.values()].slice(-400);

    const prompt = [
      `List ${Math.ceil(need * 1.4)} single English vocabulary words for ${track.toUpperCase()} preparation.`,
      "",
      `Band: ${band.brief}`,
      `Loose theme for this set: ${theme}. Treat it as a tendency, not a cage —`,
      `include words that fit the band even when they do not fit the theme.`,
      "",
      "Rules:",
      "- Single words only. No phrases, no hyphenated compounds.",
      "- No proper nouns, no archaisms nobody writes any more.",
      track === "sat"
        ? "- Every word must be one a strong high-school student could plausibly meet in a set text, an editorial, or an exam passage."
        : "- Every word must be one a well-read adult could plausibly meet in print.",
      "- Vary the part of speech: include verbs and adjectives, not only nouns.",
      REGISTER_BY_TRACK[track].length
        ? "\n" + REGISTER_BY_TRACK[track].join("\n")
        : "",
      avoid.length
        ? `\nDo NOT include any of these, which are already used:\n${avoid.join(", ")}`
        : "",
      "",
      'Reply with ONLY a JSON array of lowercase strings. No prose, no code fence.',
    ]
      .filter(Boolean)
      .join("\n");

    let candidates: string[];
    try {
      candidates = extractJson<string[]>(await ask(prompt));
    } catch (error) {
      console.error(`  selection round ${round + 1} failed: ${String(error).slice(0, 120)}`);
      continue;
    }

    for (const raw of candidates) {
      if (kept.length >= PER_MONTH) break;
      const word = String(raw).trim().toLowerCase();
      if (!word || /[^a-z]/.test(word)) continue;
      const key = stem(word);
      if (!key || seen.has(key)) continue;
      seen.set(key, word);
      kept.push(word);
    }
    console.log(`  round ${round + 1}: ${kept.length}/${PER_MONTH}`);
  }

  return kept;
}

interface RawCard {
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  mnemonic: string;
  synonyms?: string[];
  antonyms?: string[];
}

/** Stage 2: cards for a batch of already-chosen words. */
async function writeCards(words: string[], notes: string[] = []): Promise<RawCard[]> {
  const prompt = [
    `Write a vocabulary study card for each of these ${words.length} words:`,
    words.map((w) => `- ${w}`).join("\n"),
    "",
    "Use exactly these words. Do not substitute, add or omit any.",
    "",
    "For each word give:",
    '  word, partOfSpeech, definition, example, mnemonic, synonyms, antonyms',
    "",
    "Requirements, all of which matter:",
    "- definition: ONE clear sentence, at most 20 words, plain English. It must",
    "  NEVER contain the word being defined or any form of it.",
    "- example: a natural sentence that CONTAINS the word and makes its meaning",
    "  inferable from the situation. It must not restate the definition.",
    "- mnemonic: a real memory hook — a sound-alike, a root breakdown, or a",
    "  vivid image. Never a paraphrase of the definition.",
    "- synonyms/antonyms: two or three each, or an empty array.",
    notes.length ? `\nFix these problems from the last attempt:\n${notes.join("\n")}` : "",
    "",
    "Reply with ONLY a JSON array of objects. No prose, no code fence.",
  ]
    .filter(Boolean)
    .join("\n");

  return extractJson<RawCard[]>(await ask(prompt));
}

function toVocabWord(card: RawCard, track: Track): VocabWord {
  const slug = String(card.word).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    // Track-scoped and calendar-free. An id naming a month would change the
    // moment the word moved, and moving words is what reshuffling does.
    id: wordId(track, slug),
    word: String(card.word).trim(),
    partOfSpeech: String(card.partOfSpeech ?? "").trim(),
    definition: String(card.definition ?? "").trim(),
    example: String(card.example ?? "").trim(),
    mnemonic: String(card.mnemonic ?? "").trim(),
    synonyms: Array.isArray(card.synonyms) ? card.synonyms.slice(0, 3) : undefined,
    antonyms: Array.isArray(card.antonyms) ? card.antonyms.slice(0, 3) : undefined,
  };
}

async function main() {
  const options = parseArgs();
  const { track } = options;
  // One directory per track, so the two corpora never share a filename and a
  // half-finished SAT run cannot touch a finished GRE one.
  const dir = join(options.out, track);
  mkdirSync(dir, { recursive: true });

  // A lock, because two of these running at once is not a hypothetical: it
  // happened, and each process had its own in-memory dedup set unaware of the
  // other's writes. 193 duplicate words across 26 months, from logic that was
  // correct and run twice.
  const lock = join(dir, ".generating.lock");
  if (existsSync(lock)) {
    const owner = readFileSync(lock, "utf-8").trim();
    console.error(
      `Another generator appears to be running (pid ${owner}).
` +
        `If it is not, delete ${lock} and try again.`,
    );
    process.exit(1);
  }
  writeFileSync(lock, String(process.pid), "utf-8");
  const release = () => {
    try {
      rmSync(lock, { force: true });
    } catch {
      // Nothing useful to do; the message above explains the manual fix.
    }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(130);
  });
  const ordinals = Array.from(
    { length: options.months },
    (_, i) => options.start + i,
  );

  // Resume: anything already written counts, and its words are already taken.
  const seen = new Map<string, string>();

  // Seed months ship with the app and load on first launch. A corpus that
  // ignores them hands a user `denigrate` twice the moment they open both — which is the exact failure the dedup index exists to prevent.
  //
  // **This track's seeds only.** A word in the GRE corpus is not a duplicate
  // here: the two are separate curricula whose overlap is the useful middle of
  // the academic register, and excluding it would leave SAT the leftovers.
  // See docs/adr/0013-cross-track-overlap.md.
  const seedFiles = readdirSync("src/data").filter(
    (f) => f.startsWith(`${track}-`) && f.endsWith(".json"),
  );
  for (const file of seedFiles) {
    const month = JSON.parse(
      readFileSync(join("src/data", file), "utf-8"),
    ) as VocabMonth;
    for (const day of month.days) {
      for (const word of day.words) seen.set(stem(word.word), word.word);
    }
  }
  console.log(
    `${track}: excluding ${seen.size} words bundled with the app` +
      ` (from ${seedFiles.length} seed month${seedFiles.length === 1 ? "" : "s"})`,
  );
  const bundled = seen.size;
  for (const ordinal of ordinals) {
    const path = join(dir, fileFor(ordinal));
    if (!existsSync(path)) continue;
    const month = JSON.parse(readFileSync(path, "utf-8")) as VocabMonth;
    for (const day of month.days) {
      for (const word of day.words) seen.set(stem(word.word), word.word);
    }
  }
  // Counted separately from the bundled words above, so the number means
  // "already generated" rather than "already known".
  const generated = seen.size - bundled;
  if (generated > 0) console.log(`resuming: ${generated} words already generated`);

  for (const [index, ordinal] of ordinals.entries()) {
    if (options.only && ordinal !== options.only) continue;
    const path = join(dir, fileFor(ordinal));
    if (existsSync(path)) {
      console.log(`${track}/${fileFor(ordinal)}  already done`);
      continue;
    }

    const band = bandFor(track, index);
    const theme = themeFor(track, index);
    console.log(`\n${track}/${fileFor(ordinal)}  (${band.name}, ${theme})`);

    const words = await selectWords(track, index, seen);
    if (words.length === 0) {
      console.error(`  no words selected; stopping`);
      break;
    }

    const cards: VocabWord[] = [];
    for (let i = 0; i < words.length; i += CARD_BATCH) {
      const batch = words.slice(i, i + CARD_BATCH);
      let raw: RawCard[];
      try {
        raw = await writeCards(batch);
      } catch (error) {
        console.error(`  cards ${i}-${i + batch.length} failed: ${String(error).slice(0, 120)}`);
        continue;
      }

      // The app's own quality rules, then one targeted repair.
      const made = raw.map((card) => toVocabWord(card, track));
      const bad = made.filter((word) => checkWord(word).length > 0);
      if (bad.length > 0) {
        const notes = bad.flatMap((word) => checkWord(word).map((i) => `- ${i.message}`));
        try {
          const fixed = (await writeCards(bad.map((w) => w.word), notes))
            .map((card) => toVocabWord(card, track));
          for (const candidate of fixed) {
            const target = made.findIndex(
              (w) => w.word.toLowerCase() === candidate.word.toLowerCase(),
            );
            // Keep the repair only when it is actually better.
            if (target >= 0 && checkWord(candidate).length < checkWord(made[target]).length) {
              made[target] = { ...candidate, id: made[target].id };
            }
          }
        } catch {
          // A failed repair is not worth losing the batch over.
        }
      }

      cards.push(...made);
      console.log(`  cards ${cards.length}/${words.length}${bad.length ? ` (${bad.length} repaired)` : ""}`);
    }

    if (cards.length === 0) {
      console.error(`  no cards written for ${track}/${fileFor(ordinal)}; stopping`);
      break;
    }

    const days: VocabMonth["days"] = [];
    for (let i = 0; i < cards.length; i += WORDS_PER_DAY) {
      days.push({ day: days.length + 1, words: cards.slice(i, i + WORDS_PER_DAY) });
      if (days.length >= 31) break;
    }

    const month: VocabMonth = {
      track,
      ordinal,
      // The theme is the month's name now that its key is a position. The band
      // says something the title cannot, so it stays as the description.
      title: theme.charAt(0).toUpperCase() + theme.slice(1),
      days,
      description: band.name.charAt(0).toUpperCase() + band.name.slice(1),
      createdAt: new Date().toISOString(),
    };

    writeFileSync(path, JSON.stringify(month, null, 2) + "\n", "utf-8");
    console.log(`  wrote ${path} (${cards.length} words, ${days.length} days)`);
  }

  console.log(`\ndone — ${seen.size} distinct words in the ${track} corpus`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
