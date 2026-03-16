import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["sharp"],
    },
  },
  ssr: {
    external: ["sharp"],
  },
  test: {
    globals: true,
    exclude: ["lib/**", "node_modules/**"],
    server: {
      deps: {
        external: ["sharp"],
      },
    },
  },
});
