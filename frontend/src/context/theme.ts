export type ThemeMode = "light" | "dark";

export function setTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  window.localStorage.setItem("dumo-theme", mode);
}

export function initializeTheme(): void {
  setTheme("light");
}
