import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const localStorageMock = {
  clear: vi.fn(),
  getItem: vi.fn(() => null),
  key: vi.fn(() => null),
  length: 0,
  removeItem: vi.fn(),
  setItem: vi.fn(),
} as unknown as Storage;

describe("Revelio shell", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the product name and Phase 0 readiness", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Revelio" })).toBeInTheDocument();
    expect(screen.queryByText(/fast\s+review/i)).not.toBeInTheDocument();
    expect(screen.getByText("Phase 0 readiness")).toBeInTheDocument();
  });
});
