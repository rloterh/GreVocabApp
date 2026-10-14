// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PictureDiagram } from "./PictureDiagram";
import { DIAGRAMS } from "@/lib/games/pictures/diagrams";

afterEach(cleanup);

describe("PictureDiagram", () => {
  it("draws every diagram in theme tokens only", () => {
    for (const d of DIAGRAMS) {
      const { container, unmount } = render(<PictureDiagram diagram={d} highlight={d.parts[0]!.id} />);
      for (const el of container.querySelectorAll("[fill], [stroke]")) {
        for (const attr of ["fill", "stroke"]) {
          const v = el.getAttribute(attr);
          if (v && v !== "none") expect(v, `${d.id} ${attr}`).toMatch(/^hsl\(var\(--/);
        }
      }
      unmount();
    }
  });

  it("lights only the asked part and points a callout at it", () => {
    const house = DIAGRAMS.find((d) => d.id === "house")!;
    const { container } = render(<PictureDiagram diagram={house} highlight="chimney" />);
    const lit = [...container.querySelectorAll("[stroke]")].filter(
      (el) => el.getAttribute("stroke") === "hsl(var(--accent))" && el.tagName !== "path",
    );
    expect(lit.length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "A house, one part highlighted" })).toBeTruthy();
    expect(container.querySelector("g[aria-hidden] circle")).toBeTruthy();
  });

  it("draws the plain diagram with no highlight", () => {
    const house = DIAGRAMS.find((d) => d.id === "house")!;
    const { container } = render(<PictureDiagram diagram={house} highlight={null} />);
    expect(container.querySelector("g[aria-hidden]")).toBeNull();
    expect(screen.getByRole("img", { name: "A house" })).toBeTruthy();
  });
});
