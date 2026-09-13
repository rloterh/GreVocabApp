/**
 * Builds Anki's `collection.anki2` — a SQLite database in legacy schema 11.
 *
 * Schema 11 is the widest target: current Anki still imports it, and it is
 * what genanki emits.
 *
 * This module takes an already-initialised sql.js as an argument rather than
 * loading it, so it holds no reference to the WebAssembly build and can be run
 * outside a browser. `anki-export.ts` does the loading and zipping.
 *
 * Scheduling state travels with the cards. Phase 3's definition of done is
 * that a user can leave Lexicon with their progress intact, and Lexicon's SM-2
 * fields map almost one-to-one onto Anki's, so a word reviewed here arrives
 * there already scheduled rather than reset to new.
 *
 * See ROADMAP.md, Phase 3.
 */

import type { SqlJsStatic } from "sql.js";
import type { VocabMonth, WordProgress } from "@/types";
import { allWordsInMonth } from "@/lib/vocabulary";
import { DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR } from "@/lib/sm2";

/** Anki schema 11. Mirrors what Anki itself creates for a fresh collection. */
const SCHEMA = `
CREATE TABLE col (
  id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null,
  usn integer not null, ls integer not null, conf text not null,
  models text not null, decks text not null, dconf text not null,
  tags text not null
);
CREATE TABLE notes (
  id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null,
  flds text not null, sfld integer not null, csum integer not null,
  flags integer not null, data text not null
);
CREATE TABLE cards (
  id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null,
  type integer not null, queue integer not null, due integer not null,
  ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null
);
CREATE TABLE revlog (
  id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null,
  factor integer not null, time integer not null, type integer not null
);
CREATE TABLE graves (
  usn integer not null, oid integer not null, type integer not null
);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const FIELD_NAMES = [
  "Word",
  "PartOfSpeech",
  "Definition",
  "Example",
  "Mnemonic",
] as const;

/** Anki joins note fields with the unit separator, 0x1f. */
const FIELD_SEP = "\u001f";

const CARD_CSS = `.card {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 20px;
  text-align: center;
  color: #1a1a1a;
  background: #fbfaf8;
}
.word { font-size: 34px; font-weight: 600; }
.pos { font-style: italic; color: #6b6b6b; font-size: 15px; }
.definition { margin-top: 14px; }
.example { margin-top: 12px; font-style: italic; color: #4a4a4a; font-size: 17px; }
.mnemonic { margin-top: 14px; font-size: 14px; color: #6b6b6b; }
hr#answer { margin: 18px 0; border: none; border-top: 1px solid #ddd; }`;

const QFMT = `<div class="word">{{Word}}</div>
<div class="pos">{{PartOfSpeech}}</div>`;

const AFMT = `{{FrontSide}}
<hr id="answer">
<div class="definition">{{Definition}}</div>
<div class="example">{{Example}}</div>
<div class="mnemonic">{{Mnemonic}}</div>`;

/** Escape the small amount of HTML that can appear in user vocabulary. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Anki's note checksum: the first 8 hex digits of the SHA-1 of the first
 * field, as an integer. Anki uses it to find duplicates.
 */
async function fieldChecksum(text: string): Promise<number> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return parseInt(hex.slice(0, 8), 16);
}

/** Anki note GUIDs just have to be unique and stable-looking. */
function guid(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Whole days between two instants, floored. */
function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / 86_400_000);
}

export interface AnkiExportOptions {
  /** Months to export. */
  months: VocabMonth[];
  /** Progress records, keyed by word id, used to carry scheduling across. */
  progress: Record<string, WordProgress>;
  /**
   * "month" puts each month in its own subdeck under `deckName`.
   * "single" puts everything in one deck.
   */
  grouping: "month" | "single";
  /** Top-level deck name. */
  deckName: string;
  /** Injected clock, so exports can be built deterministically under test. */
  now?: Date;
}

export interface AnkiCollectionResult {
  /** The raw `collection.anki2` bytes. */
  bytes: Uint8Array;
  noteCount: number;
  deckCount: number;
  /** How many cards carried real scheduling state across. */
  scheduledCount: number;
}

/** Build the collection database for the given months. */
export async function buildAnkiCollection(
  SQL: SqlJsStatic,
  options: AnkiExportOptions,
): Promise<AnkiCollectionResult> {
  const { months, progress, grouping, deckName } = options;

  const db = new SQL.Database();
  db.run(SCHEMA);

  const nowDate = options.now ?? new Date();
  const now = nowDate.getTime();
  const nowSec = Math.floor(now / 1000);

  // Anki measures review due dates in days since the collection was created,
  // counted from that day's 4am rollover.
  const crtDate = new Date(now);
  crtDate.setHours(4, 0, 0, 0);
  if (crtDate.getTime() > now) crtDate.setDate(crtDate.getDate() - 1);
  const crtMs = crtDate.getTime();
  const crtSec = Math.floor(crtMs / 1000);

  const modelId = now;
  const decks: Record<string, unknown> = {
    "1": {
      id: 1,
      name: "Default",
      mod: nowSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: true,
      browserCollapsed: true,
      desc: "",
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
    },
  };

  let nextDeckId = now + 1;
  const deckIdFor = new Map<string, number>();
  function ensureDeck(name: string): number {
    const existing = deckIdFor.get(name);
    if (existing !== undefined) return existing;
    const id = nextDeckId++;
    deckIdFor.set(name, id);
    decks[String(id)] = {
      id,
      name,
      mod: nowSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      desc: "Exported from Lexicon",
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
    };
    return id;
  }

  const models = {
    [String(modelId)]: {
      id: modelId,
      name: "Lexicon Vocabulary",
      type: 0,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: 1,
      tmpls: [
        {
          name: "Recognition",
          ord: 0,
          qfmt: QFMT,
          afmt: AFMT,
          bqfmt: "",
          bafmt: "",
          did: null,
          bfont: "",
          bsize: 0,
        },
      ],
      flds: FIELD_NAMES.map((name, ord) => ({
        name,
        ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
        description: "",
        plainText: false,
        collapsed: false,
        excludeFromSearch: false,
      })),
      css: CARD_CSS,
      latexPre:
        "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
      latexPost: "\\end{document}",
      latexsvg: false,
      req: [[0, "any", [0]]],
      tags: [],
      vers: [],
    },
  };

  const conf = {
    nextPos: 1,
    estTimes: true,
    activeDecks: [1],
    sortType: "noteFld",
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: String(modelId),
    collapseTime: 1200,
  };

  const dconf = {
    "1": {
      id: 1,
      mod: 0,
      name: "Default",
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: {
        bury: false,
        delays: [1.0, 10.0],
        initialFactor: 2500,
        ints: [1, 4, 0],
        order: 1,
        perDay: 20,
      },
      rev: {
        bury: false,
        ease4: 1.3,
        ivlFct: 1.0,
        maxIvl: 36500,
        perDay: 200,
        hardFactor: 1.2,
      },
      lapse: {
        delays: [10.0],
        leechAction: 1,
        leechFails: 8,
        minInt: 1,
        mult: 0.0,
      },
      dyn: false,
      newMix: 0,
      newPerDayMinimum: 0,
      interdayLearningMix: 0,
      reviewOrder: 0,
      newSortOrder: 0,
      newGatherPriority: 0,
      buryInterdayLearning: false,
    },
  };

  const noteStmt = db.prepare(
    "INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  );
  const cardStmt = db.prepare(
    "INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );

  let noteCount = 0;
  let scheduledCount = 0;
  let newPosition = 0;
  // Anki ids double as millisecond timestamps and must be unique.
  let idCursor = now;
  const nextId = () => idCursor++;

  for (const month of months) {
    const fullDeckName =
      grouping === "month" ? `${deckName}::${month.title}` : deckName;
    const did = ensureDeck(fullDeckName);

    for (const word of allWordsInMonth(month)) {
      const fields = [
        word.word,
        word.partOfSpeech,
        word.definition,
        word.example,
        word.mnemonic,
      ].map(escapeHtml);

      const noteId = nextId();
      noteStmt.run([
        noteId,
        guid(),
        modelId,
        nowSec,
        -1,
        "",
        fields.join(FIELD_SEP),
        fields[0],
        await fieldChecksum(fields[0]),
        0,
        "",
      ]);

      const p = progress[word.id];
      const scheduled =
        p && p.dueAt != null && p.intervalDays != null && p.intervalDays > 0
          ? p
          : null;
      if (scheduled) scheduledCount++;

      // type/queue 2 is "review"; 0 is "new".
      const type = scheduled ? 2 : 0;
      const queue = scheduled ? 2 : 0;
      const due = scheduled
        ? Math.max(0, daysBetween(crtMs, new Date(scheduled.dueAt!).getTime()))
        : newPosition++;
      const ivl = scheduled ? Math.max(1, scheduled.intervalDays!) : 0;
      // Anki stores ease as permille and refuses anything under 1300.
      const factor = scheduled
        ? Math.round(
            Math.max(
              MIN_EASE_FACTOR,
              scheduled.easeFactor ?? DEFAULT_EASE_FACTOR,
            ) * 1000,
          )
        : 0;

      cardStmt.run([
        nextId(),
        noteId,
        did,
        0,
        nowSec,
        -1,
        type,
        queue,
        due,
        ivl,
        factor,
        scheduled ? (scheduled.reps ?? 0) : 0,
        0,
        0,
        0,
        0,
        0,
        "",
      ]);
      noteCount++;
    }
  }

  noteStmt.free();
  cardStmt.free();

  // nextPos is the next free position, and positions are 0-based: two new
  // cards occupy 0 and 1, so the next one is 2.
  conf.nextPos = newPosition;

  db.run(
    "INSERT INTO col (id,crt,mod,scm,ver,dty,usn,ls,conf,models,decks,dconf,tags) VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)",
    [
      crtSec,
      now,
      now,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(dconf),
      JSON.stringify({}),
    ],
  );

  const bytes = db.export();
  db.close();

  return { bytes, noteCount, deckCount: deckIdFor.size, scheduledCount };
}
