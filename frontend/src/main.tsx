import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import { initializeTheme } from "./context/theme";
import { loadBranding } from "./context/branding";

initializeTheme();
void loadBranding();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
