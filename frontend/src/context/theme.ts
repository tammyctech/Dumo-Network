export type ThemeMode = "light" | "dark";

export function setTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  window.localStorage.setItem("dumo-theme", mode);
}

export function initializeTheme(): void {
  const saved = window.localStorage.getItem("dumo-theme");
  const userSelected = window.localStorage.getItem("dumo-theme-user-set") === "true";
  setTheme(userSelected && (saved === "light" || saved === "dark") ? saved : "dark");
}
