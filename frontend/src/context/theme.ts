export function initializeTheme(): void {
  const root = document.documentElement;

  root.classList.add("dark");
  root.dataset.theme = "dark";
  root.style.colorScheme = "dark";
}
