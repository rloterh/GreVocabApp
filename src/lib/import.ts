/**
 * One place that turns a file's text into loaded months.
 *
 * Shared by the import button, both folder pickers, and the drag-and-drop
 * overlay, so a format supported in one is supported in all of them and the
 * counting cannot drift between them.
 *
 * `loadMonth` is injected rather than imported so this stays pure and
 * testable — it is the vocab store's own validator in the app.
 *
 * See ROADMAP.md, Phase 3.
 */

export type LoadMonth = (
  raw: unknown,
) => { ok: true; monthKey: string } | { ok: false; error: string };

/** File extensions this app will attempt to import. */
export const ACCEPTED_FILE = /\.(json|csv|apkg)$/i;

/** Anki packages are a zip, so they arrive as bytes rather than text. */
const BINARY_FILE = /\.apkg$/i;

export interface ImportOptions {
  /**
   * Which month an Anki package's words should land in. Anki decks carry no
   * month of their own, so the caller decides — normally the first month with
   * nothing loaded in it, so an import cannot overwrite existing vocabulary.
   */
  apkgMonth?: () => string;
}

export interface ImportOutcome {
  loaded: number;
  failed: number;
  /** One message per failure, already fit to show a user. */
  errors: string[];
}

const EMPTY: ImportOutcome = { loaded: 0, failed: 0, errors: [] };

function merge(a: ImportOutcome, b: ImportOutcome): ImportOutcome {
  return {
    loaded: a.loaded + b.loaded,
    failed: a.failed + b.failed,
    errors: [...a.errors, ...b.errors],
  };
}

/**
 * Import one file's text.
 *
 * CSV is converted to month-shaped objects first; both formats then go through
 * the same `loadMonth` validation. A CSV may span several months, which is why
 * this counts rather than returning a boolean.
 *
 * The CSV converter is imported lazily so a JSON-only session never pays for
 * it, and so this module has no static dependency on the parser.
 */
export async function importText(
  name: string,
  text: string,
  loadMonth: LoadMonth,
): Promise<ImportOutcome> {
  let objects: unknown[];
  try {
    if (name.toLowerCase().endsWith(".csv")) {
      const { csvToMonthObjects, monthFromFilename } = await import("@/lib/csv");
      objects = csvToMonthObjects(text, {
        fallbackMonth: monthFromFilename(name) ?? undefined,
      });
    } else {
      objects = [JSON.parse(text)];
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : "could not be parsed";
    return { loaded: 0, failed: 1, errors: [`${name}: ${reason}`] };
  }

  let outcome = EMPTY;
  for (const obj of objects) {
    const result = loadMonth(obj);
    outcome = merge(
      outcome,
      result.ok
        ? { loaded: 1, failed: 0, errors: [] }
        : { loaded: 0, failed: 1, errors: [`${name}: ${result.error}`] },
    );
  }
  return outcome;
}

/**
 * Import one Anki package.
 *
 * Separate from `importText` because a .apkg is binary, and because reading
 * one pulls in sql.js — which should not load for a session that only ever
 * touches JSON.
 */
export async function importApkgFile(
  name: string,
  bytes: Uint8Array,
  loadMonth: LoadMonth,
  monthKey: string,
): Promise<ImportOutcome> {
  try {
    const [{ loadSqlJs }, { importApkg }] = await Promise.all([
      import("@/lib/sql-loader"),
      import("@/lib/anki-import"),
    ]);
    const SQL = await loadSqlJs();
    const { month, skipped } = await importApkg(SQL, { bytes, monthKey });

    const result = loadMonth(month);
    if (!result.ok) {
      return { loaded: 0, failed: 1, errors: [`${name}: ${result.error}`] };
    }
    return {
      loaded: 1,
      failed: 0,
      errors:
        skipped > 0
          ? [`${name}: skipped ${skipped} note${skipped === 1 ? "" : "s"} with no usable word or meaning`]
          : [],
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "could not be read";
    return { loaded: 0, failed: 1, errors: [`${name}: ${reason}`] };
  }
}

/** Import every acceptable file in a list, ignoring the rest. */
export async function importFiles(
  files: Iterable<File>,
  loadMonth: LoadMonth,
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  let outcome = EMPTY;
  for (const file of files) {
    if (!ACCEPTED_FILE.test(file.name)) continue;
    if (BINARY_FILE.test(file.name)) {
      const monthKey = options.apkgMonth?.() ?? FALLBACK_MONTH_KEY;
      const bytes = new Uint8Array(await file.arrayBuffer());
      outcome = merge(
        outcome,
        await importApkgFile(file.name, bytes, loadMonth, monthKey),
      );
      continue;
    }
    outcome = merge(outcome, await importText(file.name, await file.text(), loadMonth));
  }
  return outcome;
}

/**
 * Where an Anki import lands when the caller names nowhere.
 *
 * It used to be the current calendar month, which was a reasonable guess when
 * months were dates. It cannot be one now, and guessing a teaching position is
 * worse than guessing a date — position 1 is content the user already has.
 * Every real caller passes `apkgMonth`; this is the last resort, and it goes
 * somewhere nothing else will be.
 */
const FALLBACK_MONTH_KEY = "gre/99";

/**
 * Turn an outcome into toast copy.
 *
 * Kept here so every caller reports the same way — the three import paths used
 * to phrase partial failures differently, and one of them dropped the count
 * entirely.
 */
export function describeOutcome(outcome: ImportOutcome): {
  title: string;
  description?: string;
  variant: "success" | "error";
} {
  const { loaded, failed } = outcome;
  if (loaded === 0 && failed === 0) {
    return { title: "Nothing to import", variant: "error" };
  }
  if (loaded === 0) {
    return {
      title: "Import failed",
      description:
        outcome.errors[0] ??
        `${failed} file${failed === 1 ? "" : "s"} could not be parsed`,
      variant: "error",
    };
  }
  return {
    title: `Loaded ${loaded} month${loaded === 1 ? "" : "s"}`,
    description:
      failed > 0
        ? `${failed} file${failed === 1 ? "" : "s"} failed — check the console`
        : undefined,
    variant: "success",
  };
}
