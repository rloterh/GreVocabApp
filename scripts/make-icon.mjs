/**
 * Render the Lexicon mark to a 1024x1024 PNG.
 *
 * `npm run tauri icon` needs a large PNG source, and the mark only existed as
 * an SVG. Rather than commit a binary nobody can regenerate, this draws the
 * same geometry as public/icon.svg directly and writes the source PNG.
 *
 *   node scripts/make-icon.mjs [outfile]
 *
 * The shapes are the SVG's, scaled from its 64x64 viewBox by 16. Edges are
 * antialiased by sampling each pixel on a 4x4 grid — enough for the rounded
 * corners and the dot to look clean at every size Tauri downscales to.
 *
 * No dependencies: PNG is written by hand on top of node:zlib.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const SCALE = SIZE / 64; // the SVG viewBox is 64x64
const SUBSAMPLES = 4; // per axis, so 16 samples per pixel

const BACKGROUND = [0x0a, 0x0a, 0x0a];
const MARK = [0x5d, 0xca, 0xa5];

/** rect 0,0 64x64 rx=14 */
const CORNER_RADIUS = 14 * SCALE;

/** The "L": a vertical stem and a foot, from the SVG path. */
const STEM = { x0: 20 * SCALE, y0: 20 * SCALE, x1: 24 * SCALE, y1: 44 * SCALE };
const FOOT = { x0: 24 * SCALE, y0: 40 * SCALE, x1: 36 * SCALE, y1: 44 * SCALE };

/** circle cx=46 cy=24 r=4 */
const DOT = { cx: 46 * SCALE, cy: 24 * SCALE, r: 4 * SCALE };

const inRect = (x, y, r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** Inside the rounded square that forms the icon's background? */
function inRoundedSquare(x, y) {
  const r = CORNER_RADIUS;
  const nx = x < r ? r - x : x > SIZE - r ? x - (SIZE - r) : 0;
  const ny = y < r ? r - y : y > SIZE - r ? y - (SIZE - r) : 0;
  if (nx === 0 || ny === 0) return true; // edges and middle
  return nx * nx + ny * ny <= r * r; // corners
}

function inDot(x, y) {
  const dx = x - DOT.cx;
  const dy = y - DOT.cy;
  return dx * dx + dy * dy <= DOT.r * DOT.r;
}

/** RGBA rows, antialiased by supersampling. */
function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const step = 1 / SUBSAMPLES;
  const total = SUBSAMPLES * SUBSAMPLES;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const x = px + (sx + 0.5) * step;
          const y = py + (sy + 0.5) * step;
          if (!inRoundedSquare(x, y)) continue;
          bg++;
          if (inRect(x, y, STEM) || inRect(x, y, FOOT) || inDot(x, y)) fg++;
        }
      }

      const i = (py * SIZE + px) * 4;
      if (bg === 0) continue; // stays transparent

      // Composite the mark over the background within the covered area.
      const markShare = fg / bg;
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(
          BACKGROUND[c] * (1 - markShare) + MARK[c] * markShare,
        );
      }
      pixels[i + 3] = Math.round((bg / total) * 255);
    }
  }
  return pixels;
}

/** CRC-32, as PNG chunks require. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function toPng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 is "none".
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = process.argv[2] ?? "src-tauri/icons/source.png";
writeFileSync(out, toPng(render()));
console.log(`Wrote ${out} (${SIZE}x${SIZE})`);
