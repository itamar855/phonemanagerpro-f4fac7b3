import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        // avisos do CRM no celular (push + toque abre a conversa)
        importScripts: ["crm-push-sw.js"],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("jspdf")) {
              return "vendor-jspdf";
            }
            if (id.includes("lucide-react")) {
              return "vendor-lucide";
            }
            if (id.includes("recharts")) {
              return "vendor-recharts";
            }
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            // Arrastar-e-soltar só é usado no funil do CRM: fica num chunk próprio,
            // baixado junto com o funil e não no vendor global.
            if (id.includes("@dnd-kit")) {
              return "vendor-dndkit";
            }
            return "vendor";
          }
        },
      },
    },
  },
}));
