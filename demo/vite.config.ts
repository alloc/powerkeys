import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  plugins: [preact()],
  resolve: {
    alias: {
      "sigma-keys": resolve(__dirname, "../src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
