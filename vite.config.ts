import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { siteFiles } from "./vite/siteFiles";

/**
 * Platform dev server.
 *
 *   API_PROXY_TARGET   default https://staging.phantix.site
 *   DEV_PORT           default 5174
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.API_PROXY_TARGET || process.env.API_PROXY_TARGET || "https://staging.phantix.site";
  const port = Number(env.DEV_PORT || process.env.DEV_PORT || 5174);
  const localPublic = path.resolve(__dirname, "public");
  const monorepoPublic = path.resolve(__dirname, "../public");

  return {
    plugins: [
      react(),
      siteFiles({
        siteUrl: "https://platform.phantixlabs.com",
        // Sign-in, registration and the legal pages are public; the rest of
        // the platform (docs included) is behind sign-in.
        allow: ["/$", "/login", "/register", "/privacy", "/terms", "/aup", "/cookies"],
        sitemap: () => ["/login", "/register", "/privacy", "/terms", "/aup", "/cookies"],
        entryBudgetKB: 600,
      }),
    ],
    publicDir: fs.existsSync(localPublic) ? localPublic : monorepoPublic,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // Platform how-to guides live in the monorepo-root docs/ tree, shared
        // with the Command Centre app --- not duplicated per app.
        "@docs": path.resolve(__dirname, "."),
      },
    },
    server: {
      port,
      host: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          ws: true,
        },
      },
    },
    build: {
      // Lazy chunks for heavy libraries (Mermaid and its parser) are ~700 KB and
      // load only on pages that draw diagrams. The first-paint bundle has its
      // own, stricter budget (siteFiles, in plugins above).
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            motion: ["framer-motion"],
          },
        },
      },
    },
  };
});
