import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Revelio shell", () => {
  it("shows the product name and Phase 0 readiness", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Revelio" })).toBeInTheDocument();
    expect(screen.queryByText(/fast\s+review/i)).not.toBeInTheDocument();
    expect(screen.getByText("Phase 0 readiness")).toBeInTheDocument();
  });
});
