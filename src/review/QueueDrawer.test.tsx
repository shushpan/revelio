import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PullRequestSummary } from "../providers/contracts";
import { QueueDrawer } from "./QueueDrawer";

function makePullRequest(id: number, title: string): PullRequestSummary {
  return {
    ref: { repository: { workspace: "acme", slug: "widgets" }, id },
    title,
    description: "",
    state: "OPEN",
    updatedAt: "2026-09-01T00:00:00Z",
    sourceBranch: "feature",
    targetBranch: "main",
    sourceCommit: "abc123",
    author: { id: "user-1", displayName: "Ada" },
    reviewerIds: [],
  };
}

const queue = [makePullRequest(1, "First PR"), makePullRequest(2, "Second PR")];

describe("QueueDrawer", () => {
  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={0}
        isOpen={false}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders one row per queue entry with the current one marked, named Review queue", () => {
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={1}
        isOpen={true}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Review queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /First PR/ })).toBeInTheDocument();
    const current = screen.getByRole("button", { name: /Second PR/ });
    expect(current).toHaveAttribute("aria-current", "true");
  });

  it("calls onSelect with the chosen pull request", () => {
    const onSelect = vi.fn();
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={0}
        isOpen={true}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /First PR/ }));
    expect(onSelect).toHaveBeenCalledWith(queue[0]);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={0}
        isOpen={true}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Close is activated", () => {
    const onClose = vi.fn();
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={0}
        isOpen={true}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close review queue" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables row selection and close while busy", () => {
    render(
      <QueueDrawer
        queue={queue}
        currentIndex={0}
        isOpen={true}
        busy={true}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /First PR/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close review queue" })).toBeDisabled();
  });
});
