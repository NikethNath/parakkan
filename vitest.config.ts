import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The `@/…` alias the app uses everywhere; without it a unit test can only
// cover modules that happen to import relatively.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
