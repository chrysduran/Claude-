import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Pulso Obra",
        short_name: "Pulso Obra",
        description: "Captura de PPC, incumplimientos, restricciones y planeación semanal del Last Planner System desde el celular.",
        lang: "es-MX",
        theme_color: "#16505A",
        background_color: "#F4F6F6",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1100 }, // exceljs se carga aparte, solo al exportar
  test: { environment: "node" },
});
