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
  },
});
