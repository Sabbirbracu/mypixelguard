import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    // Fonts and the tiny SVG marks are fetched like any other file; nothing is inlined as base64 (keeps HTML and CSS small).
    assetsInlineLimit: 0,
    cssMinify: true,
  },
});
