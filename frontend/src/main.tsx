import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

// Authentication is carried only in Secure HttpOnly cookies. Include cookies
// for local cross-origin development as well as same-origin production calls.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => nativeFetch(input, {
  ...init,
  credentials: init.credentials ?? "include",
});
import { initializeTheme, ThemeProvider } from "./context/theme";
import { loadBranding } from "./context/branding";
import { AppPromptProvider } from "./context/AppPrompt";

initializeTheme();
void loadBranding();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppPromptProvider>
        <App />
      </AppPromptProvider>
    </ThemeProvider>
  </React.StrictMode>
);
