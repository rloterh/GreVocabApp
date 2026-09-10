/**
 * Lazily load sql.js and its WebAssembly build.
 *
 * Kept in one place so the Anki reader and writer share a single copy, and so
 * no other module needs a static reference to the wasm — that is what lets
 * `anki-collection.ts` and `anki-import.ts` be tested outside a browser.
 */

import type { SqlJsStatic } from "sql.js";

let cached: Promise<SqlJsStatic> | null = null;

/** Resolves to an initialised sql.js. Loaded once per session, on first use. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  cached ??= (async () => {
    const [initSqlJs, wasmUrl] = await Promise.all([
      import("sql.js").then((m) => m.default),
      import("sql.js/dist/sql-wasm.wasm?url").then((m) => m.default),
    ]);
    return initSqlJs({ locateFile: () => wasmUrl });
  })();
  return cached;
}
