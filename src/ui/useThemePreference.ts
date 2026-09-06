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
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

const readSystemPreference = (): "light" | "dark" => {
  try {
    return window.matchMedia(PREFERS_DARK_MEDIA).matches ? "dark" : "light";
  } catch {
    return "light";
  }
};

export function useThemePreference(): ThemePreference {
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(readSystemPreference);
  const appliedRef = useRef<"light" | "dark" | null>(null);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(PREFERS_DARK_MEDIA);
    } catch {
      return;
    }
    const listener = (event: { matches: boolean }): void => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    try {
      media.addEventListener("change", listener);
    } catch {
      // Best effort: live OS-preference changes simply won't be tracked.
    }
    return () => {
      try {
        media.removeEventListener("change", listener);
      } catch {
        // Best effort.
      }
    };
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
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best effort: the choice still drives this session even if it cannot persist.
    }
    setThemeState(next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
