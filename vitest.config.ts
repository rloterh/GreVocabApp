import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // Everything under test here is pure logic — no DOM needed.
    environment: "node",
    // Component tests opt into jsdom with a `@vitest-environment jsdom`
    // docblock; everything else stays on the faster node environment.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    // Several modules are loaded by dynamic import at the point of use — the
    // CSV parser, the Anki reader, sql.js. The first such import in a worker
    // pays for transforming the module, which on a loaded machine can exceed
    // the 5s default and is reported as a test timeout rather than what it is.
    // These ceilings are generous on purpose: they never mask a failing
    // assertion, only a slow transform.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
