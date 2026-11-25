import "@fontsource-variable/space-grotesk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { captureShare } from "./lib/capture";
import "./styles.css";

// A recipe shared into the app (Web Share Target): keep it for the import screen, open the recipes tab.
if (captureShare(location)) history.replaceState(null, "", "/#/rezepte");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
