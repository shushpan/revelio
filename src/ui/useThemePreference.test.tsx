import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import { useThemePreference } from "./useThemePreference";

function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as unknown as Storage;
}

interface FakeMedia {
  readonly mediaQueryList: MediaQueryList;
  readonly setMatches: (next: boolean) => void;
}

function makeMatchMedia(initialMatches: boolean): FakeMedia {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;
  return {
    mediaQueryList,
    setMatches: (next) => {
      matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

function Harness(): JSX.Element {
  const { theme, resolvedTheme, setTheme } = useThemePreference();
  return (
    <div>
      <p data-testid="state">{`${theme}:${resolvedTheme}`}</p>
      <button type="button" onClick={() => setTheme("dark")}>
        Dark
      </button>
      <button type="button" onClick={() => setTheme("light")}>
        Light
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        System
      </button>
    </div>
  );
}

describe("useThemePreference", () => {
  let media: FakeMedia;

  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorage());
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    media = makeMatchMedia(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.mediaQueryList),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("defaults to system, resolved from the OS preference", () => {
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("system:light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("re-resolves when the OS preference changes while on system", () => {
    render(<Harness />);
    act(() => {
      media.setMatches(true);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("system:dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("persists an explicit choice and ignores subsequent OS preference changes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("state")).toHaveTextContent("dark:dark");
    expect(window.localStorage.getItem("revelio.theme")).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    act(() => {
      media.setMatches(true);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("dark:dark");
  });

  it("restores a previously stored explicit choice on mount", () => {
    window.localStorage.setItem("revelio.theme", "light");
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("light:light");
  });

  it("removes the previously applied theme class when switching themes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
