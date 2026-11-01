export function initializeTheme(): void {
  const root = document.documentElement;

  root.classList.remove("dark");
  root.dataset.theme = "light";
  root.style.colorScheme = "light";
}
