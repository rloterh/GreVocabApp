/**
 * Anki `.apkg` export.
 *
 * An .apkg is a zip holding `collection.anki2` plus a `media` manifest. This
 * module owns the two heavy dependencies — sql.js, which carries a WebAssembly
 * build of SQLite, and fflate for the zip — and both are loaded here so that
 * nothing reaches a user who never clicks Export.
 *
 * The database itself is built by `anki-collection.ts`, which is deliberately
 * free of any WebAssembly reference so it can be exercised outside a browser.
 *
 * See ROADMAP.md, Phase 3.
 */

import { buildAnkiCollection, type AnkiExportOptions } from "@/lib/anki-collection";
import { loadSqlJs } from "@/lib/sql-loader";

export type { AnkiExportOptions };

export interface AnkiExportResult {
  blob: Blob;
  /** Suggested filename. */
  filename: string;
  noteCount: number;
  deckCount: number;
  /** How many cards carried real scheduling state across. */
  scheduledCount: number;
}

/**
 * Build an .apkg for the given months.
 *
 * Returns a Blob the caller can hand to a download link.
 */
export async function exportApkg(
  options: AnkiExportOptions,
): Promise<AnkiExportResult> {
  const [SQL, fflate] = await Promise.all([loadSqlJs(), import("fflate")]);
  const collection = await buildAnkiCollection(SQL, options);

  const zipped = fflate.zipSync(
    {
      "collection.anki2": collection.bytes,
      // No media, but Anki requires the manifest to be present.
      media: new TextEncoder().encode("{}"),
    },
    { level: 6 },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    blob: new Blob([zipped as unknown as BlobPart], {
      type: "application/octet-stream",
    }),
    filename: `lexicon-${stamp}.apkg`,
    noteCount: collection.noteCount,
    deckCount: collection.deckCount,
    scheduledCount: collection.scheduledCount,
  };
}
