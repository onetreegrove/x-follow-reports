export type ThemePreference = "system" | "light" | "dark";
export type ThemeName = "light" | "dark";

export const themeStorageKey = "x-follow-theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | Map<string, string>;

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeName {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function getStoredThemePreference(storage: ThemeStorage): ThemePreference {
  const value = storage instanceof Map ? storage.get(themeStorageKey) : storage.getItem(themeStorageKey);
  return isThemePreference(value) && value !== "system" ? value : "system";
}

export function setStoredThemePreference(storage: ThemeStorage, preference: ThemePreference) {
  if (preference === "system") {
    storage instanceof Map ? storage.delete(themeStorageKey) : storage.removeItem(themeStorageKey);
    return;
  }
  storage instanceof Map ? storage.set(themeStorageKey, preference) : storage.setItem(themeStorageKey, preference);
}
