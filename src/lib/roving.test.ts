import { describe, expect, it } from "vitest";
import { isRovingKey, rovingTarget } from "./roving";

describe("rovingTarget", () => {
  const all = [true, true, true, true, true];

  it("moves one step either way, in both axes", () => {
    expect(rovingTarget(all, 1, "ArrowDown")).toBe(2);
    expect(rovingTarget(all, 1, "ArrowRight")).toBe(2);
    expect(rovingTarget(all, 1, "ArrowUp")).toBe(0);
    expect(rovingTarget(all, 1, "ArrowLeft")).toBe(0);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(rovingTarget(all, 4, "ArrowDown")).toBeNull();
    expect(rovingTarget(all, 0, "ArrowUp")).toBeNull();
  });

  it("skips words already paired", () => {
    const some = [true, false, false, true, true];
    expect(rovingTarget(some, 0, "ArrowDown")).toBe(3);
    expect(rovingTarget(some, 3, "ArrowUp")).toBe(0);
  });

  it("jumps to the first and last open entry", () => {
    const some = [false, true, true, false, true];
    expect(rovingTarget(some, 2, "Home")).toBe(1);
    expect(rovingTarget(some, 2, "End")).toBe(4);
  });

  it("enters the group from outside at the near end", () => {
    expect(rovingTarget(all, -1, "ArrowDown")).toBe(0);
    expect(rovingTarget(all, -1, "ArrowUp")).toBe(4);
  });

  it("has nowhere to go when everything is paired", () => {
    expect(rovingTarget([false, false], 0, "ArrowDown")).toBeNull();
  });

  it("knows its keys", () => {
    expect(isRovingKey("ArrowLeft")).toBe(true);
    expect(isRovingKey("Enter")).toBe(false);
  });
});
