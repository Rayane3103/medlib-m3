import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds the phone-scanner page (mobile-scanner/) as a single self-contained
 * HTML file (JS/CSS inlined) so the Rust side can serve it with no separate
 * asset routes. Output goes straight into src-tauri so it can be bundled as
 * a Tauri resource - see tauri.conf.json's bundle.resources.
 *
 * Run with: npm run build:mobile
 */
export default defineConfig({
  root: "mobile-scanner",
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../src-tauri/mobile-scanner",
    emptyOutDir: true,
    target: "es2018",
  },
});
