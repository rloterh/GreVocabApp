/**
 * Picture It's blind-review sheets.
 *
 *   npx tsx scripts/audit-pictures.tsx <out-dir> [seed] [dark]
 *
 * Writes one HTML page per diagram with every part lit in turn, tiles shuffled
 * by the seed and numbered with no names; `names.txt` with each diagram's
 * parts in a shuffled order, for the reviewer; and `key.json`, which the
 * reviewer never sees. Screenshot the pages and hand the reviewer the images
 * and names.txt only. Use a fresh seed for every pass, so a redrawn diagram is
 * never judged from a remembered layout. See docs/GAMES.md §4.10.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PictureDiagram } from "../src/components/games/PictureDiagram";
import { DIAGRAMS } from "../src/lib/games/pictures/diagrams";
import { seededShuffle } from "../src/lib/order";

const [outDir, seedArg, theme] = process.argv.slice(2);
const seed = Number(seedArg ?? 1);
const tokens =
  theme === "dark"
    ? "--background:24 10% 8%;--foreground:40 20% 92%;--secondary:24 8% 16%;--accent:160 45% 52%"
    : "--background:40 33% 98%;--foreground:24 10% 10%;--secondary:30 15% 93%;--accent:160 45% 36%";
const key: Record<string, Record<number, string>> = {};
const lists: string[] = [];

for (const d of DIAGRAMS) {
  const parts = seededShuffle(d.parts, seed + d.id.length);
  key[d.id] = {};
  let html = `<!doctype html><meta charset="utf-8"><style>
:root{${tokens}}
body{background:hsl(var(--background));color:hsl(var(--foreground));font-family:Inter,sans-serif;margin:16px}
h2{margin:0 0 8px;font-size:18px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.c{border:1px solid hsl(var(--foreground) / 0.2);border-radius:8px;padding:4px;font-size:16px;font-weight:700}</style>
<h2>${d.title}</h2><div class="g">`;
  parts.forEach((p, i) => {
    key[d.id]![i + 1] = p.name;
    html += `<div class="c">#${i + 1}${renderToStaticMarkup(createElement(PictureDiagram, { diagram: d, highlight: p.id }))}</div>`;
  });
  html += `</div>`;
  writeFileSync(join(outDir, `${d.id}.html`), html);
  const names = seededShuffle(
    d.parts.map((p) => p.name),
    seed * 7,
  );
  lists.push(`${d.id} — ${d.title}: ${names.join(", ")}`);
}
writeFileSync(join(outDir, "names.txt"), lists.join("\n") + "\n");
writeFileSync(join(outDir, "key.json"), JSON.stringify(key, null, 2));
