import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "dumo-theme";
const USER_SET_KEY = "dumo-theme-user-set";

function systemTheme(): ThemeMode {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(mode: ThemeMode, remember = true): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#090B11" : "#f6f8f7");
  if (remember) {
    window.localStorage.setItem(THEME_KEY, mode);
    window.localStorage.setItem(USER_SET_KEY, "true");
  }
}

export function initializeTheme(): ThemeMode {
  const saved = window.localStorage.getItem(THEME_KEY);
  const userSelected = window.localStorage.getItem(USER_SET_KEY) === "true";
  const mode = userSelected && (saved === "light" || saved === "dark") ? saved : systemTheme();
  setTheme(mode, false);
  return mode;
}

type ThemeContextValue = {
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(USER_SET_KEY) === "true") return;
      const next = event.matches ? "dark" : "light";
      setTheme(next, false);
      setMode(next);
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const value = useMemo(() => ({
    mode,
    toggleTheme: () => {
      const next = mode === "dark" ? "light" : "dark";
      setTheme(next);
      setMode(next);
    },
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
