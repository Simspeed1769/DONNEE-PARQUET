import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Plotly ne sert qu'aux pages Pathologies, CSP, Mortalite et Reperes,
          // toutes chargees a la demande : l'isoler evite qu'il pese sur
          // l'ouverture de l'ecran DAMIR, qui n'utilise qu'ECharts.
          if (id.indexOf("plotly.js") >= 0 || id.indexOf("react-plotly.js") >= 0) return "vendor-plotly";
          if (id.indexOf("echarts") >= 0 || id.indexOf("zrender") >= 0) return "vendor-echarts";
          if (id.indexOf("react-dom") >= 0 || id.indexOf("/react/") >= 0) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
