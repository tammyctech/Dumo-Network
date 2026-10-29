import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import { ThemeProvider } from "./context/ThemeContext";
import { initializeTheme } from "./context/theme";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
