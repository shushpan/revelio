import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeChoice } from "./ThemeControl";

const STORAGE_KEY = "revelio.theme";
const PREFERS_DARK_MEDIA = "(prefers-color-scheme: dark)";

export interface ThemePreference {
  readonly theme: ThemeChoice;
  readonly resolvedTheme: "light" | "dark";
  readonly setTheme: (theme: ThemeChoice) => void;
}

const readStoredTheme = (): ThemeChoice => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
};

const readSystemPreference = (): "light" | "dark" =>
  window.matchMedia(PREFERS_DARK_MEDIA).matches ? "dark" : "light";

export function useThemePreference(): ThemePreference {
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(readSystemPreference);
  const appliedRef = useRef<"light" | "dark" | null>(null);

  useEffect(() => {
    const media = window.matchMedia(PREFERS_DARK_MEDIA);
    const listener = (event: { matches: boolean }): void => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (appliedRef.current === resolvedTheme) return;
    if (appliedRef.current) document.documentElement.classList.remove(appliedRef.current);
    document.documentElement.classList.add(resolvedTheme);
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    appliedRef.current = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
