/**
 * Test setup.
 *
 * The three Zustand stores persist through `localStorage`, which the node test
 * environment does not provide. A tiny in-memory implementation is enough and
 * keeps the suite out of jsdom — everything under test is logic, not DOM.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}

// Component tests use jest-dom matchers (toBeInTheDocument, toBeDisabled...).
// Importing here keeps every test file from repeating it.
import "@testing-library/jest-dom/vitest";
