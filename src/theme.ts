export type Theme = "light" | "dark";
export function initialTheme(): Theme {
  try {
    return localStorage.getItem("mttl-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem("mttl-theme", theme);
  } catch {
    /* Theme still works when storage is unavailable. */
  }
}
