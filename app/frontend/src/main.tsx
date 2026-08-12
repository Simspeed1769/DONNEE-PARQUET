import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyStoredPalette } from "./charts/palette";
import "./theme.css";
import "./styles.css";
import "./explore.css";
import "./panorama.css";
import "./correlations.css";
import "./methodology.css";
import "./components/copyLinkButton.css";
import "./components/seriesDrawer.css";
import "./components/exportPngButton.css";

// Avant le premier rendu : voir `applyStoredPalette`.
applyStoredPalette();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
