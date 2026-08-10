import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./styles.css";
import "./explore.css";
import "./panorama.css";
import "./correlations.css";
import "./methodology.css";
import "./components/copyLinkButton.css";
import "./components/exportPngButton.css";
import "./components/paletteToggle.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
