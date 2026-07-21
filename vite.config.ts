import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: "src/client",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@client": path.resolve(import.meta.dirname, "src/client"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.CLIENT_PORT ?? 5173),
    proxy: {
      // API_PORT lets a dev server run alongside the container on :3000
      "/api": `http://localhost:${process.env.API_PORT ?? 3000}`,
      "/mcp": `http://localhost:${process.env.API_PORT ?? 3000}`,
    },
  },
});
