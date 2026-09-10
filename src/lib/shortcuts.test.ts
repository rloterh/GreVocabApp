import { describe, expect, it } from "vitest";
import {
  ALL_SHORTCUTS,
  DIRECT,
  GO_TO,
  isTypingTarget,
  resolveShortcut,
} from "@/lib/shortcuts";

describe("direct keys", () => {
  it("sends / to search", () => {
    const r = resolveShortcut(null, "/");
    expect(r.action).toEqual({ type: "navigate", page: "search" });
    expect(r.handled).toBe(true);
  });

  it("opens help on ?", () => {
    expect(resolveShortcut(null, "?").action).toEqual({ type: "help" });
  });

  it("reports Escape as a close, without consuming it", () => {
    const r = resolveShortcut(null, "Escape");
    expect(r.action).toEqual({ type: "close" });
    // Escape belongs to dialogs and the flashcard pause screen too.
    expect(r.handled).toBe(false);
  });

  it("ignores keys that are not bound", () => {
    expect(resolveShortcut(null, "x")).toEqual({
      action: null,
      pending: null,
      handled: false,
    });
  });
});

describe("g sequences", () => {
  it("arms on g without doing anything yet", () => {
    const r = resolveShortcut(null, "g");
    expect(r.action).toBeNull();
    expect(r.pending).toBe("g");
    expect(r.handled).toBe(true);
  });

  it.each(Object.entries(GO_TO))("g %s goes to its page", (key, spec) => {
    const r = resolveShortcut("g", key);
    expect(r.action).toEqual(spec.action);
    expect(r.pending).toBeNull();
  });

  it("accepts an uppercase second key", () => {
    expect(resolveShortcut("g", "D").action).toEqual({
      type: "navigate",
      page: "dashboard",
    });
  });

  it("cancels the sequence on an unknown second key rather than staying armed", () => {
    const r = resolveShortcut("g", "z");
    expect(r.action).toBeNull();
    expect(r.pending).toBeNull();
    expect(r.handled).toBe(false);
  });

  it("does not treat a second g as arming again", () => {
    // "g g" is not a binding; it should cancel, not re-arm.
    expect(resolveShortcut("g", "g").pending).toBeNull();
  });

  it("routes / through the sequence rather than to search when g is pending", () => {
    // Cancelling is the safe reading: the user started something else.
    const r = resolveShortcut("g", "/");
    expect(r.action).toBeNull();
  });
});

describe("modifiers belong to the browser and the OS", () => {
  it.each([
    ["ctrl", { ctrl: true }],
    ["meta", { meta: true }],
    ["alt", { alt: true }],
  ])("ignores %s combinations", (_name, modifiers) => {
    expect(resolveShortcut(null, "/", modifiers)).toEqual({
      action: null,
      pending: null,
      handled: false,
    });
  });

  it("drops a pending sequence when a modifier combination arrives", () => {
    expect(resolveShortcut("g", "d", { ctrl: true }).pending).toBeNull();
  });
});

describe("isTypingTarget", () => {
  const el = (tagName: string, isContentEditable = false) =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it("returns false for a plain element", () => {
    expect(isTypingTarget(el("DIV"))).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT", "input", "textarea"])(
    "returns true for %s",
    (tagName) => {
      expect(isTypingTarget(el(tagName))).toBe(true);
    },
  );

  it("returns true for a contenteditable element", () => {
    expect(isTypingTarget(el("DIV", true))).toBe(true);
  });

  it.each([
    ["null", null],
    ["a non-element event target", {} as EventTarget],
  ])("returns false for %s", (_name, target) => {
    expect(isTypingTarget(target)).toBe(false);
  });
});

describe("the shortcut table", () => {
  it("lists every binding for the help overlay", () => {
    expect(ALL_SHORTCUTS).toHaveLength(
      Object.keys(GO_TO).length + Object.keys(DIRECT).length,
    );
  });

  it("binds no two shortcuts to the same keys", () => {
    const keys = ALL_SHORTCUTS.map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sends no two shortcuts to the same page", () => {
    const pages = ALL_SHORTCUTS.map((s) =>
      s.action.type === "navigate" ? s.action.page : s.action.type,
    );
    expect(new Set(pages).size).toBe(pages.length);
  });

  it("gives every shortcut a label", () => {
    expect(ALL_SHORTCUTS.every((s) => s.label.length > 0)).toBe(true);
  });
});
