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

  it("preserves unrelated root classes when applying the resolved theme", () => {
    document.documentElement.classList.add("unrelated-class");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("unrelated-class")).toBe(true);
  });

  describe("when browser storage/media APIs throw", () => {
    it("falls back to system when localStorage.getItem throws during initial render", () => {
      vi.stubGlobal("localStorage", {
        ...makeLocalStorage(),
        getItem: () => {
          throw new Error("getItem failed");
        },
      });
      render(<Harness />);
      expect(screen.getByTestId("state")).toHaveTextContent("system:light");
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    it("keeps the in-memory theme and DOM update when localStorage.setItem throws", () => {
      vi.stubGlobal("localStorage", {
        ...makeLocalStorage(),
        setItem: () => {
          throw new Error("setItem failed");
        },
      });
      render(<Harness />);
      fireEvent.click(screen.getByRole("button", { name: "Dark" }));
      expect(screen.getByTestId("state")).toHaveTextContent("dark:dark");
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("falls back to light when matchMedia throws during initial resolution", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => {
          throw new Error("matchMedia failed");
        }),
      );
      render(<Harness />);
      expect(screen.getByTestId("state")).toHaveTextContent("system:light");
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    it("remains usable when matchMedia throws only during the effect's subscription attempt", () => {
      let calls = 0;
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => {
          calls += 1;
          if (calls === 1) return media.mediaQueryList;
          throw new Error("matchMedia failed on subscription");
        }),
      );
      render(<Harness />);
      expect(screen.getByTestId("state")).toHaveTextContent("system:light");
      fireEvent.click(screen.getByRole("button", { name: "Dark" }));
      expect(screen.getByTestId("state")).toHaveTextContent("dark:dark");
      fireEvent.click(screen.getByRole("button", { name: "System" }));
      expect(screen.getByTestId("state")).toHaveTextContent("system:light");
    });

    it("does not leak a listener when addEventListener throws after partially registering it", () => {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      const mediaQueryList = {
        matches: false,
        addEventListener: vi.fn(
          (_type: string, listener: (event: { matches: boolean }) => void) => {
            listeners.add(listener);
            throw new Error("addEventListener failed");
          },
        ),
        removeEventListener: vi.fn(
          (_type: string, listener: (event: { matches: boolean }) => void) => {
            listeners.delete(listener);
          },
        ),
      } as unknown as MediaQueryList;
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => mediaQueryList),
      );

      const { unmount } = render(<Harness />);
      expect(listeners.size).toBe(1);

      unmount();
      expect(mediaQueryList.removeEventListener).toHaveBeenCalled();
      expect(listeners.size).toBe(0);
    });

    it("does not crash when removeEventListener throws during cleanup", () => {
      const mediaQueryList = {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(() => {
          throw new Error("removeEventListener failed");
        }),
      } as unknown as MediaQueryList;
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => mediaQueryList),
      );

      const { unmount } = render(<Harness />);
      expect(() => unmount()).not.toThrow();
    });
  });
});
