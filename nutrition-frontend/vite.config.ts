import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Dev: port 5174 next to the Fitnesstracker's 5173; /api goes to the shared backend. For the login
// to work against a local backend, add http://localhost:5174 to CORS_EXTRA_ORIGINS there (not needed
// through this proxy, which makes the API same-origin).
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        id: "/",
        name: "Kalorientracker",
        short_name: "Kalorien",
        description: "Ernährung loggen – Zielwerte kommen aus dem Fitnesstracker.",
        lang: "de",
        start_url: "/",
        share_target: { action: "/share-target", method: "GET", params: { title: "title", text: "text", url: "url" } },
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0914",
        theme_color: "#0B0914",
        // Long press on the installed app icon (Android/Chrome); on iOS via a Kurzbefehl with the same URL.
        shortcuts: [
          { name: "Snack eintragen (Text)", short_name: "Snack", description: "Kurz tippen, was es war", url: "/#snack", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
          { name: "Per Sprache eintragen", short_name: "Sprache", description: "Mahlzeit einsprechen", url: "/#sprache", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
        ],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // The API is never cached by the service worker: offline data lives in IndexedDB (Dexie,
        // Roadmap 03), not in HTTP caches.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
});
