import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PullRequestSummary } from "../providers/contracts";
import { ReviewToolbar } from "./ReviewToolbar";

const pullRequest: PullRequestSummary = {
  ref: { repository: { workspace: "acme", slug: "review" }, id: 7 },
  title: "Review this change",
  description: "",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer"],
};

describe("ReviewToolbar", () => {
  afterEach(() => cleanup());

  it("renders the wired controls in the eight-slot order with an accessible back action", () => {
    const onBack = vi.fn();
    render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={2}
        busy={false}
        onBack={onBack}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Back to inbox" })).toBeEnabled();
    expect(screen.getByText("acme/review #7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue (2)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Finish Review" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    expect(onBack).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Queue (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish Review" }));
  });

  it("labels and tooltips the layout, collapse, and display controls Task 3 will wire, disabled for now", () => {
    render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={0}
        busy={false}
        onBack={vi.fn()}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Split view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unified view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collapse all files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Display options" })).toBeDisabled();
  });

  it("disables Back, Queue, and Finish while busy", () => {
    render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={1}
        busy
        onBack={vi.fn()}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Back to inbox" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Queue (1)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finish Review" })).toBeDisabled();
  });

  it("exposes the Back tooltip accessibly when the icon button receives focus", async () => {
    render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={0}
        busy={false}
        onBack={vi.fn()}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Back to inbox" }));

    expect(await screen.findByRole("tooltip", { name: "Back to inbox" })).toBeInTheDocument();
  });
});
