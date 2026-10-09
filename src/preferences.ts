/** Preferences are optional: private browsing and desktop policies may block storage. */
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the current session usable when preferences cannot be saved.
  }
}
