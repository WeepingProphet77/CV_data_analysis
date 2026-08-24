import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://<user>.github.io/CV_data_analysis/, so every
// asset URL needs that prefix in production. Locally `vite dev` serves from /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/CV_data_analysis/" : "/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
}));
