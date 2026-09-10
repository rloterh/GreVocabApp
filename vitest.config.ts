import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // Everything under test here is pure logic — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
