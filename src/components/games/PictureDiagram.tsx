/**
 * Draw a Picture It diagram, with one part highlighted and a callout to it.
 *
 * Every colour is a theme token, so the drawing is right in all ten themes:
 * outlines in the ink colour, pieces filled with the secondary surface, the
 * asked-about part in the accent. With `highlight` null it draws the plain
 * diagram — the review list and the audit's labelled sheets use that.
 */

import type { Diagram, Shape } from "@/lib/games/pictures/types";
import { CANVAS } from "@/lib/games/pictures/types";
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function PictureDiagram({
  diagram,
  highlight,
  className,
}: {
  diagram: Diagram;
  highlight: string | null;
  className?: string;
}) {
  const part = highlight ? diagram.parts.find((p) => p.id === highlight) : undefined;
  return (
    <svg
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      role="img"
      aria-label={part ? `${diagram.title}, one part highlighted` : diagram.title}
      className={cn("h-auto w-full", className)}
    >
      {diagram.shapes.map((shape, i) => (
        <ShapeEl key={i} shape={shape} on={Boolean(highlight && shape.part === highlight)} />
      ))}
      {part && (
        <g aria-hidden="true">
          <path
            d={`M${part.from[0]} ${part.from[1]} Q ${(part.from[0] + part.anchor[0]) / 2} ${part.from[1]}, ${part.anchor[0]} ${part.anchor[1]}`}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={part.anchor[0]} cy={part.anchor[1]} r={5} fill="hsl(var(--accent))" />
        </g>
      )}
    </svg>
  );
}

function ShapeEl({ shape, on }: { shape: Shape; on: boolean }) {
  const kind = shape.kind ?? "fill";
  const ink = "hsl(var(--foreground) / 0.82)";
  const accent = "hsl(var(--accent))";
  const style =
    kind === "detail"
      ? { fill: "none", stroke: ink, strokeWidth: 1.3, opacity: 0.45 }
      : kind === "line"
        ? { fill: "none", stroke: on ? accent : ink, strokeWidth: on ? 4 : 2 }
        : kind === "ink"
          ? { fill: on ? accent : ink, stroke: on ? accent : ink, strokeWidth: 2 }
          : {
              fill: on ? "hsl(var(--accent) / 0.3)" : "hsl(var(--secondary))",
              stroke: on ? accent : ink,
              strokeWidth: on ? 3 : 2,
            };
  const common = {
    ...style,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    fillRule: shape.evenodd ? ("evenodd" as const) : undefined,
  };
  // The accent wash is translucent; under it goes the plain surface, so a lit
  // part hides what it covers exactly as an unlit one does.
  if (on && kind === "fill") {
    return (
      <>
        <Geometry shape={shape} paint={{ ...common, fill: "hsl(var(--secondary))", stroke: "none" }} />
        <Geometry shape={shape} paint={common} />
      </>
    );
  }
  return <Geometry shape={shape} paint={common} />;
}

type Paint = SVGProps<SVGPathElement>;

function Geometry({ shape, paint }: { shape: Shape; paint: Paint }) {
  // Presentation attributes are the same on every shape element.
  const p = paint as SVGProps<SVGElement> as object;
  if ("d" in shape) return <path d={shape.d} {...p} />;
  if ("rect" in shape) {
    const [x, y, width, height, r] = shape.rect;
    return <rect x={x} y={y} width={width} height={height} rx={r} {...p} />;
  }
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    return <circle cx={cx} cy={cy} r={r} {...p} />;
  }
  if ("ellipse" in shape) {
    const [cx, cy, rx, ry] = shape.ellipse;
    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...p} />;
  }
  const [x1, y1, x2, y2] = shape.line;
  return <line x1={x1} y1={y1} x2={x2} y2={y2} {...p} />;
}
