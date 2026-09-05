import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PullRequestSummary } from "../providers/contracts";
import { DropdownMenuItem } from "../ui/DropdownMenu";
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
    const finishButtons = screen.getAllByRole("button", { name: "Finish Review" });
    expect(finishButtons).toHaveLength(2);
    for (const finishButton of finishButtons) {
      expect(finishButton).toBeVisible();
    }

    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    expect(onBack).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Queue (2)" }));
    fireEvent.click(finishButtons[0]);
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
    for (const finishButton of screen.getAllByRole("button", { name: "Finish Review" })) {
      expect(finishButton).toBeDisabled();
    }
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

  it("renders a narrow Finish before row2 and a wide Finish after row2, so each breakpoint's visible button is tab-reachable in visual order", () => {
    const { container } = render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={2}
        busy={false}
        onBack={vi.fn()}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const order = buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent);

    // The narrow instance sits right after Back (row 1 at <768px); the wide instance sits
    // after row2 (rightmost slot at >=768px). Only one of the two is display:none at a
    // given breakpoint, so Tab always reaches exactly one of them in visual order.
    expect(order).toEqual([
      "Back to inbox",
      "Finish Review",
      "Queue (2)",
      "Split view",
      "Unified view",
      "Collapse all files",
      "Display options",
      "System",
      "Light",
      "Dark",
      "Finish Review",
    ]);
    expect(buttons[1].className).toContain("review-toolbar-finish-narrow");
    expect(buttons[buttons.length - 1].className).toContain("review-toolbar-finish-wide");
  });

  it("fires the split, unified, collapse, and display callbacks when supplied and enables their controls", async () => {
    const onSplitView = vi.fn();
    const onUnifiedView = vi.fn();
    const onCollapseAll = vi.fn();
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
        onSplitView={onSplitView}
        onUnifiedView={onUnifiedView}
        onCollapseAll={onCollapseAll}
        displayOptions={<DropdownMenuItem onSelect={vi.fn()}>Line numbers</DropdownMenuItem>}
      />,
    );

    expect(screen.getByRole("button", { name: "Split view" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unified view" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Collapse all files" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Display options" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Split view" }));
    fireEvent.click(screen.getByRole("button", { name: "Unified view" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse all files" }));
    expect(onSplitView).toHaveBeenCalledOnce();
    expect(onUnifiedView).toHaveBeenCalledOnce();
    expect(onCollapseAll).toHaveBeenCalledOnce();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Display options" }), { button: 0 });
    expect(await screen.findByRole("menuitem", { name: "Line numbers" })).toBeInTheDocument();
  });

  it("exposes collapse-all state via aria-pressed and an accurate label/tooltip", () => {
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
        onCollapseAll={vi.fn()}
        collapsedAll={false}
      />,
    );

    const collapseButton = screen.getByRole("button", { name: "Collapse all files" });
    expect(collapseButton).toHaveAttribute("aria-pressed", "false");

    cleanup();
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
        onCollapseAll={vi.fn()}
        collapsedAll={true}
      />,
    );

    const expandButton = screen.getByRole("button", { name: "Expand all files" });
    expect(expandButton).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps split, unified, collapse, and display disabled while busy even when callbacks are supplied", () => {
    render(
      <ReviewToolbar
        pullRequest={pullRequest}
        queueCount={0}
        busy
        onBack={vi.fn()}
        onQueue={vi.fn()}
        onFinish={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
        onSplitView={vi.fn()}
        onUnifiedView={vi.fn()}
        onCollapseAll={vi.fn()}
        displayOptions={<DropdownMenuItem onSelect={vi.fn()}>Line numbers</DropdownMenuItem>}
      />,
    );

    expect(screen.getByRole("button", { name: "Split view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unified view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collapse all files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Display options" })).toBeDisabled();
  });
});
