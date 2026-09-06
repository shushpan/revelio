import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeControl } from "./ThemeControl";

describe("ThemeControl", () => {
  afterEach(() => cleanup());

  it("renders three theme choices and reports the requested theme", () => {
    const onThemeChange = vi.fn();
    render(<ThemeControl theme="system" resolvedTheme="light" onThemeChange={onThemeChange} />);

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });
});
