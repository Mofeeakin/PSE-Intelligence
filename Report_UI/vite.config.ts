import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// API_PROXY_TARGET is injected by docker-compose as an env var (Node.js process.env).
// Locally (without Docker) it falls back to the Django dev server on :8000.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts" }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // HMR websocket must point back to the host machine's published port,
    // not the internal Docker address, so the browser can reach it.
    hmr: { host: "localhost", port: 5173 },
    proxy: {
      // All /api/* calls are forwarded to Django — no CORS needed in dev.
      "/api": { target: apiTarget, changeOrigin: true },
      "/media": { target: apiTarget, changeOrigin: true },
    },
  },
});
