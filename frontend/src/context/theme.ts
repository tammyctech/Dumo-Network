export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "dumo_theme_preference";

export function isThemePreference(
  value: string | null
): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function resolveTheme(
  preference: ThemePreference
): ResolvedTheme {
  if (preference !== "system") return preference;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  return resolved;
}

export function initializeTheme(): ThemePreference {
  const preference = getStoredTheme();
  applyTheme(preference);
  return preference;
}
