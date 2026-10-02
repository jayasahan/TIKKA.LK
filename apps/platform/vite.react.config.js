import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(directory, "..", "..");

export default defineConfig({
  root: path.join(workspace, "react"),
  publicDir: path.join(directory, "public"),
  plugins: [
    react(),
    {
      name: "preserve-legacy-public-metadata",
      closeBundle() {
        const output = path.join(directory, "dist");
        fs.mkdirSync(output, { recursive: true });
        for (const file of ["robots.txt", "sitemap.xml"]) {
          fs.copyFileSync(path.join(directory, file), path.join(output, file));
        }
      }
    }
  ],
  server: {
    fs: { allow: [workspace] },
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false, cookieDomainRewrite: "" },
      "/health": { target: "http://localhost:3000", changeOrigin: false }
    }
  },
  build: {
    outDir: path.join(directory, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: path.join(workspace, "react/index.html") }
  }
});
