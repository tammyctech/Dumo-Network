import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: ["favicon.ico"],

      manifest: {
        name: "Dumo Youth Network",
        short_name: "DYN",
        description:
          "Dumo Youth Network Election Monitoring Platform",

        theme_color: "#064e3b",
        background_color: "#ffffff",

        display: "standalone",
        start_url: "/",
        scope: "/",

        icons: [
          {
            src: "/dyn-favicon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/dyn-favicon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/dyn-favicon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],

        navigateFallback: "/index.html",

        navigateFallbackDenylist: [/^\/api\//],

        runtimeCaching: [],
      },
    }),
  ],
});