import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      // Use our custom service worker for push notifications
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",

      // Automatically update the installed application
      registerType: "autoUpdate",

      // Include the DYN favicon
      includeAssets: [
        "favicon.ico",
        "dyn-favicon-32.png",
      ],

      // Dumo Youth Network app configuration
      manifest: {
        id: "/",
        name: "Dumo Youth Network",
        short_name: "DYN",
        description:
          "Dumo Youth Network Election Monitoring Platform",

        theme_color: "#064e3b",
        background_color: "#ffffff",

        display: "standalone",
        orientation: "any",

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
        ],
      },

      // Custom service worker build configuration
      injectManifest: {
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,woff2}",
        ],

        maximumFileSizeToCacheInBytes:
          3 * 1024 * 1024,
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],
});