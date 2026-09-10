/**
 * Share a deck as a URL-safe blob.
 *
 * Copy a month to the clipboard, paste it somewhere, and whoever pastes it back
 * gets the deck. No server, no accounts — which is the point: cloud sync is
 * explicitly not planned, and this is the substitute.
 *
 * Compression is `CompressionStream("gzip")`, which the platform already
 * provides, rather than pulling in lz-string. Vocabulary JSON is highly
 * repetitive, so gzip typically gets a month under a quarter of its raw size.
 *
 * See ROADMAP.md, Phase 5.
 */

import type { VocabMonth } from "@/types";

/**
 * Prefix on every blob. It makes a pasted string self-identifying, and the
 * version digit means a future format change can be rejected with a real
 * message instead of a JSON parse error.
 */
export const SHARE_PREFIX = "lex1:";

/**
 * Refuse to build a blob larger than this. Past roughly this size a paste stops
 * being practical anyway, and it is a cheap guard against someone trying to
 * share their entire archive as one string.
 */
export const MAX_BLOB_LENGTH = 200_000;

/** Uint8Array -> base64url, without the padding that breaks in URLs. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) blows the stack on large inputs.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url -> Uint8Array. Throws if the string is not valid base64. */
function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Is this runtime able to share and receive decks at all? */
export function supportsSharing(): boolean {
  return (
    typeof CompressionStream === "function" &&
    typeof DecompressionStream === "function"
  );
}

/**
 * Encode a month as a shareable blob.
 *
 * Only the vocabulary travels. Progress is deliberately left behind: it is the
 * recipient's word list, not the sender's review history, and sending someone
 * else's ease factors would be meaningless at best.
 */
export async function encodeDeck(month: VocabMonth): Promise<string> {
  if (!supportsSharing()) {
    throw new Error("This browser cannot compress — sharing is unavailable.");
  }
  const payload: VocabMonth = {
    month: month.month,
    displayName: month.displayName,
    days: month.days,
    author: month.author,
    description: month.description,
    createdAt: month.createdAt,
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const blob = SHARE_PREFIX + toBase64Url(await gzip(json));

  if (blob.length > MAX_BLOB_LENGTH) {
    throw new Error(
      "This deck is too large to share as a link. Export it as a file instead.",
    );
  }
  return blob;
}

/**
 * Decode a shared blob back into a month-shaped object.
 *
 * The result is *not* trusted — the caller passes it to `loadMonth` so it goes
 * through the same validation as a file from disk. A shared string is the least
 * trustworthy input this app takes.
 */
export async function decodeDeck(blob: string): Promise<unknown> {
  if (!supportsSharing()) {
    throw new Error("This browser cannot decompress — sharing is unavailable.");
  }
  const trimmed = blob.trim();
  if (!trimmed) throw new Error("Nothing to import — paste a deck code first.");
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    throw new Error(
      `That does not look like a Lexicon deck code (it should start with "${SHARE_PREFIX}").`,
    );
  }

  const body = trimmed.slice(SHARE_PREFIX.length).replace(/\s+/g, "");
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(body);
  } catch {
    throw new Error("That deck code is damaged — it is not valid base64.");
  }

  let json: string;
  try {
    json = new TextDecoder().decode(await gunzip(bytes));
  } catch {
    throw new Error("That deck code is damaged and could not be decompressed.");
  }

  try {
    return JSON.parse(json);
  } catch {
    throw new Error("That deck code did not contain a readable deck.");
  }
}

/** Extract a deck code from arbitrary pasted text, if there is one in it. */
export function findDeckCode(text: string): string | null {
  const match = new RegExp(`${SHARE_PREFIX}[A-Za-z0-9_-]+`).exec(text);
  return match ? match[0] : null;
}
