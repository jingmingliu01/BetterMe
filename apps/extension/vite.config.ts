import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        onboarding: resolve(rootDir, "onboarding.html"),
        popup: resolve(rootDir, "popup.html"),
        settings: resolve(rootDir, "settings.html"),
        block: resolve(rootDir, "block.html"),
        review: resolve(rootDir, "review.html"),
        background: resolve(rootDir, "src/background/service-worker.ts"),
        "expiry-guard": resolve(rootDir, "src/content/expiry-guard.ts")
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") {
            return "background/service-worker.js";
          }
          if (chunk.name === "expiry-guard") {
            return "content/expiry-guard.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
