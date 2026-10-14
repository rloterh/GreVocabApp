/**
 * Picture It's diagrams, as data.
 *
 * Every diagram is a handful of plain shapes on a 440 × 330 canvas. A shape
 * that belongs to a named part carries that part's id, so the game can
 * highlight it; everything is drawn in theme tokens, so a diagram is right in
 * every theme without a raster asset in sight.
 *
 * Drawn in-house rather than sourced — see
 * docs/adr/0018-picture-it-in-house-diagrams.md for what was measured.
 */

export const CANVAS = { width: 440, height: 330 } as const;

/** How a shape is painted. */
export type ShapeKind =
  /** A solid piece with an outline — most parts. */
  | "fill"
  /** A stroke only, at full weight: strings, laces, a single fret. */
  | "line"
  /** A faint stroke for texture: fluting, grain, waves. Never a part. */
  | "detail"
  /** Filled with the ink colour: a pupil, a dot. */
  | "ink";

export type Shape = {
  part?: string;
  kind?: ShapeKind;
  /** Even-odd filling, for a ring drawn as one path (a bezel). */
  evenodd?: boolean;
} & (
  | { d: string }
  | { rect: [x: number, y: number, w: number, h: number, r?: number] }
  | { circle: [cx: number, cy: number, r: number] }
  | { ellipse: [cx: number, cy: number, rx: number, ry: number] }
  | { line: [x1: number, y1: number, x2: number, y2: number] }
);

export interface DiagramPart {
  id: string;
  /** What the player must name: "bargeboard". */
  name: string;
  definition: string;
  /** Where the callout ends, on the part. */
  anchor: [number, number];
  /** Where the callout starts, clear of the drawing. */
  from: [number, number];
}

export interface Diagram {
  id: string;
  /** Shown above the drawing, so the player knows what they are looking at. */
  title: string;
  shapes: Shape[];
  parts: DiagramPart[];
}
