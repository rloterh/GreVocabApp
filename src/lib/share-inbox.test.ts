import { describe, expect, it, vi } from "vitest";
import { drainSharedFiles, type Invoke } from "./share-inbox";

/** A fake inbox behaving like share.rs: taking a file removes it. */
function inbox(files: Record<string, string>, unreadable: string[] = []) {
  const store = new Map(Object.entries(files));
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "list_shared_files") {
      return [...store.keys()].sort().map((id) => ({ id, name: id.split("__")[1] ?? id }));
    }
    if (cmd === "take_shared_file") {
      const id = String(args?.id);
      if (unreadable.includes(id)) throw new Error("gone");
      const body = store.get(id);
      store.delete(id);
      return new TextEncoder().encode(body).buffer;
    }
    throw new Error(`unexpected ${cmd}`);
  });
  return { invoke: invoke as unknown as Invoke, store };
}

describe("drainSharedFiles", () => {
  it("turns each waiting share into a File with its original name", async () => {
    const { invoke, store } = inbox({
      "100-0__words.json": '{"a":1}',
      "100-1__list.csv": "word,definition",
    });
    const files = await drainSharedFiles(invoke);
    expect(files.map((f) => f.name)).toEqual(["words.json", "list.csv"]);
    expect(await files[0]!.text()).toBe('{"a":1}');
    expect(store.size).toBe(0);
  });

  it("imports a share once, however often the app comes to the front", async () => {
    const { invoke } = inbox({ "100-0__words.json": "{}" });
    expect(await drainSharedFiles(invoke)).toHaveLength(1);
    expect(await drainSharedFiles(invoke)).toHaveLength(0);
  });

  it("skips a file it cannot read, without stranding the others", async () => {
    const { invoke } = inbox({ "100-0__bad.json": "{}", "100-1__good.json": "{}" }, ["100-0__bad.json"]);
    const files = await drainSharedFiles(invoke);
    expect(files.map((f) => f.name)).toEqual(["good.json"]);
  });

  it("finds nothing in an empty inbox", async () => {
    const { invoke } = inbox({});
    expect(await drainSharedFiles(invoke)).toEqual([]);
  });
});
