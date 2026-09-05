import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityTab } from "./ActivityTab";

describe("ActivityTab", () => {
  afterEach(() => cleanup());

  it("shows a loading state before the shared signals state exists", () => {
    render(<ActivityTab state={undefined} onRetry={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows a loading state while the shared signals state is loading", () => {
    render(<ActivityTab state={{ status: "loading" }} onRetry={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows newest-first activity once loaded", () => {
    render(
      <ActivityTab
        state={{
          status: "loaded",
          signals: [
            {
              id: "1",
              kind: "commented",
              actorId: "alice",
              createdAt: "2026-08-29T09:00:00Z",
            },
            { id: "2", kind: "approved", actorId: "bob", createdAt: "2026-08-29T11:00:00Z" },
          ],
        }}
        onRetry={vi.fn()}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("bob");
    expect(items[1]).toHaveTextContent("alice");
  });

  it("shows the empty state when loaded with no activity", () => {
    render(<ActivityTab state={{ status: "loaded", signals: [] }} onRetry={vi.fn()} />);

    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });

  it("shows a sanitized error with a Retry action that calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <ActivityTab
        state={{ status: "error", error: "Unable to load review activity." }}
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Unable to load review activity.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
