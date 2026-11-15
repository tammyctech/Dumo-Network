import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "dumo-theme";
const THEME_EVENT = "dumo-theme-change";

export function currentTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

export function applyTheme(theme: Theme, persist = true): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (persist) window.localStorage.setItem(STORAGE_KEY, theme);
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

export function initializeTheme(): void {
  applyTheme(currentTheme(), false);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  useEffect(() => {
    const sync = (event: Event) => setThemeState((event as CustomEvent<Theme>).detail ?? currentTheme());
    const storage = () => setThemeState(currentTheme());
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(THEME_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  return { theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") };
}
