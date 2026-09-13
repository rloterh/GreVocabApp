import { describe, expect, it } from "vitest";
import {
  decodeDeck,
  encodeDeck,
  findDeckCode,
  MAX_BLOB_LENGTH,
  SHARE_PREFIX,
  supportsSharing,
} from "@/lib/share";
import { parseVocabMonth } from "@/lib/vocabulary";
import type { VocabMonth } from "@/types";

const MONTH: VocabMonth = {
  track: "gre",
  ordinal: 1,
  title: "April 2026",
  description: "A shared deck",
  days: [
    {
      day: 1,
      words: [
        {
          id: "2026-04-abate",
          word: "abate",
          partOfSpeech: "verb",
          definition: "To lessen in intensity.",
          example: "The storm abated by dawn.",
          mnemonic: "a-BATE, like bait shrinking",
          synonyms: ["subside", "wane"],
        },
        {
          id: "2026-04-cogent",
          word: "cogent",
          partOfSpeech: "adjective",
          definition: "Clear and convincing.",
          example: "A cogent argument.",
          mnemonic: "co-agent",
        },
      ],
    },
    {
      day: 2,
      words: [
        {
          id: "2026-04-dearth",
          word: "dearth",
          partOfSpeech: "noun",
          definition: "A scarcity.",
          example: "A dearth of options.",
          mnemonic: "death of supply",
        },
      ],
    },
  ],
};

describe("supportsSharing", () => {
  it("is available in this runtime", () => {
    // If this fails the rest of the suite is meaningless, so assert it first.
    expect(supportsSharing()).toBe(true);
  });
});

describe("round trip", () => {
  it("returns the deck it was given", async () => {
    const decoded = await decodeDeck(await encodeDeck(MONTH));
    expect(decoded).toEqual({
      track: "gre",
      ordinal: 1,
      title: "April 2026",
      description: "A shared deck",
      days: MONTH.days,
      author: undefined,
      createdAt: undefined,
    });
  });

  it("produces something parseVocabMonth accepts", async () => {
    const decoded = await decodeDeck(await encodeDeck(MONTH));
    const validated = parseVocabMonth(decoded);
    expect(validated.days.flatMap((d) => d.words)).toHaveLength(3);
    expect(validated.days[0].words[0].synonyms).toEqual(["subside", "wane"]);
  });

  it("survives a big deck without blowing the stack", async () => {
    // toBase64Url chunks its input for exactly this reason.
    const big: VocabMonth = {
      track: "gre",
      ordinal: 2,
      title: "May 2026",
      days: Array.from({ length: 30 }, (_, d) => ({
        day: d + 1,
        words: Array.from({ length: 3 }, (_, w) => ({
          id: `2026-05-w${d}-${w}`,
          word: `word${d}-${w}`,
          partOfSpeech: "noun",
          definition: `A definition number ${d}-${w} with some length to it.`,
          example: `An example sentence for word ${d}-${w} that is realistic.`,
          mnemonic: `A mnemonic for ${d}-${w}.`,
        })),
      })),
    };
    const decoded = await decodeDeck(await encodeDeck(big));
    expect(parseVocabMonth(decoded).days).toHaveLength(30);
  });
});

describe("the blob itself", () => {
  it("is prefixed and URL-safe", async () => {
    const blob = await encodeDeck(MONTH);
    expect(blob.startsWith(SHARE_PREFIX)).toBe(true);
    const body = blob.slice(SHARE_PREFIX.length);
    // No +, /, or = — those are what break in a URL or a chat message.
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("compresses rather than just encoding", async () => {
    const raw = JSON.stringify(MONTH).length;
    const blob = await encodeDeck(MONTH);
    // Base64 alone would be ~1.33x the input; gzip should beat the raw size.
    expect(blob.length).toBeLessThan(raw);
  });

  it("stays under the shareable size cap", async () => {
    expect((await encodeDeck(MONTH)).length).toBeLessThan(MAX_BLOB_LENGTH);
  });

  it("leaves progress behind — only vocabulary travels", async () => {
    const decoded = (await decodeDeck(await encodeDeck(MONTH))) as Record<
      string,
      unknown
    >;
    // JSON.stringify drops undefined, so absent optional fields do not travel.
    expect(Object.keys(decoded).sort()).toEqual([
      "days",
      "description",
      "ordinal",
      "title",
      "track",
    ]);
  });
});

describe("decodeDeck rejects bad input with something readable", () => {
  it.each([
    ["nothing", "", /paste a deck code/],
    ["whitespace", "   ", /paste a deck code/],
    ["an unprefixed string", "just some text", /does not look like/],
    ["a truncated prefix", "lex1", /does not look like/],
    ["invalid base64", `${SHARE_PREFIX}!!!not base64!!!`, /damaged/],
    ["valid base64 that is not gzip", `${SHARE_PREFIX}aGVsbG8`, /decompressed/],
  ])("rejects %s", async (_name, input, message) => {
    await expect(decodeDeck(input)).rejects.toThrow(message);
  });

  it("rejects gzip that does not contain JSON", async () => {
    const stream = new Blob(["not json at all"])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const blob =
      SHARE_PREFIX +
      btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(decodeDeck(blob)).rejects.toThrow(/readable deck/);
  });

  it("tolerates whitespace introduced by copy and paste", async () => {
    const blob = await encodeDeck(MONTH);
    const mangled = `  ${blob.slice(0, 20)}\n  ${blob.slice(20)}  `;
    await expect(decodeDeck(mangled)).resolves.toBeTruthy();
  });
});

describe("findDeckCode", () => {
  it("pulls a code out of surrounding prose", async () => {
    const blob = await encodeDeck(MONTH);
    expect(findDeckCode(`Here is my deck: ${blob} — enjoy!`)).toBe(blob);
  });

  it("returns null when there is no code", () => {
    expect(findDeckCode("just a message")).toBeNull();
  });
});
