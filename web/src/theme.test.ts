import { describe, expect, it } from "vitest";
import { getStoredThemePreference, resolveTheme, setStoredThemePreference } from "./theme";

describe("theme preferences", () => {
  it("follows the system theme when preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("uses explicit user preferences over the system theme", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("ignores invalid stored preferences", () => {
    const storage = new Map<string, string>();
    storage.set("x-follow-theme", "sepia");

    expect(getStoredThemePreference(storage)).toBe("system");
  });

  it("persists explicit preferences and removes system preference", () => {
    const storage = new Map<string, string>();

    setStoredThemePreference(storage, "dark");
    expect(storage.get("x-follow-theme")).toBe("dark");

    setStoredThemePreference(storage, "system");
    expect(storage.has("x-follow-theme")).toBe(false);
  });
});
