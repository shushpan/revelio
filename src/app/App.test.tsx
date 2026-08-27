import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Fast Review shell", () => {
  it("shows the product name and Phase 0 readiness", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Fast Review" })).toBeInTheDocument();
    expect(screen.getByText("Phase 0 readiness")).toBeInTheDocument();
  });
});
