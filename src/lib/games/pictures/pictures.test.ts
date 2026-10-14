import { describe, expect, it } from "vitest";
import { createSession, reduce } from "../session";
import { DIAGRAMS } from "./diagrams";
import { buildPictureRound, diagramById, PICTURE_ROUND_LENGTH } from "./round";
import { CANVAS } from "./types";

const inCanvas = ([x, y]: [number, number]) => x >= 0 && x <= CANVAS.width && y >= 0 && y <= CANVAS.height;

describe("Picture It diagrams", () => {
  it("have unique ids, and unique part ids and names within each", () => {
    expect(new Set(DIAGRAMS.map((d) => d.id)).size).toBe(DIAGRAMS.length);
    for (const d of DIAGRAMS) {
      expect(new Set(d.parts.map((p) => p.id)).size, d.id).toBe(d.parts.length);
      expect(new Set(d.parts.map((p) => p.name.toLowerCase())).size, d.id).toBe(d.parts.length);
    }
  });

  it("draw every part they name, and name every part they draw", () => {
    for (const d of DIAGRAMS) {
      const drawn = new Set(d.shapes.flatMap((s) => (s.part ? [s.part] : [])));
      const named = new Set(d.parts.map((p) => p.id));
      for (const id of named) expect(drawn.has(id), `${d.id}: ${id} is never drawn`).toBe(true);
      for (const id of drawn) expect(named.has(id), `${d.id}: ${id} is drawn but not named`).toBe(true);
    }
  });

  it("never make a faint detail stroke a part — it could not be seen when highlighted", () => {
    for (const d of DIAGRAMS) {
      for (const s of d.shapes) {
        if (s.kind === "detail") expect(s.part, d.id).toBeUndefined();
      }
    }
  });

  it("keep every callout on the canvas", () => {
    for (const d of DIAGRAMS) {
      for (const p of d.parts) {
        expect(inCanvas(p.anchor), `${d.id}/${p.id} anchor`).toBe(true);
        expect(inCanvas(p.from), `${d.id}/${p.id} from`).toBe(true);
      }
    }
  });

  it("have enough parts for three same-object distractors, and a definition for each", () => {
    for (const d of DIAGRAMS) {
      expect(d.parts.length, d.id).toBeGreaterThanOrEqual(4);
      for (const p of d.parts) {
        expect(p.definition, `${d.id}/${p.id}`).toMatch(/^[A-Z].*\.$/);
        expect(p.name, `${d.id}/${p.id}`).toBe(p.name.toLowerCase());
      }
    }
  });

  it("are about ten objects and eighty-odd parts", () => {
    expect(DIAGRAMS.length).toBeGreaterThanOrEqual(10);
    expect(DIAGRAMS.reduce((n, d) => n + d.parts.length, 0)).toBeGreaterThanOrEqual(80);
  });
});

describe("Picture It rounds", () => {
  it("are ten questions, at most two from any one diagram", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const round = buildPictureRound(seed);
      expect(round).toHaveLength(PICTURE_ROUND_LENGTH);
      const per = new Map<string, number>();
      for (const q of round) per.set(q.diagram, (per.get(q.diagram) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(2);
      expect(new Set(round.map((q) => q.wordId)).size).toBe(round.length);
    }
  });

  it("offer the right part and three other parts of the same object", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of buildPictureRound(seed)) {
        const d = diagramById(q.diagram)!;
        const part = d.parts.find((p) => p.id === q.part)!;
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options[q.answer]).toBe(part.name);
        expect(q.word).toBe(part.name);
        const names = new Set(d.parts.map((p) => p.name));
        for (const o of q.options) expect(names.has(o), `${o} is not part of ${d.id}`).toBe(true);
      }
    }
  });

  it("are the same round for the same seed, and a different one for another", () => {
    expect(buildPictureRound(7)).toEqual(buildPictureRound(7));
    expect(buildPictureRound(7).map((q) => q.wordId)).not.toEqual(buildPictureRound(8).map((q) => q.wordId));
  });

  it("put the answer in every position over many rounds", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) for (const q of buildPictureRound(seed)) seen.add(q.answer);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("ask every part sooner or later", () => {
    const asked = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) for (const q of buildPictureRound(seed)) asked.add(q.wordId);
    const all = DIAGRAMS.flatMap((d) => d.parts.map((p) => `pic-${d.id}-${p.id}`));
    expect(all.filter((id) => !asked.has(id))).toEqual([]);
  });

  it("play through the ordinary session reducer", () => {
    const questions = buildPictureRound(3);
    const state = [
      { type: "START", now: 0 },
      { type: "ARM", now: 300 },
      { type: "ANSWER", choice: questions[0]!.answer, now: 2_000 },
    ].reduce((s, e) => reduce(s, e as Parameters<typeof reduce>[1], questions), createSession(questions, "standard", 15_000));
    expect(state.score).toBeGreaterThan(0);
    expect(state.answers[0]?.correct).toBe(true);
  });
});
