import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PullRequestSummary, ReviewSignal } from "../../providers/contracts";
import { DescriptionTab } from "./DescriptionTab";

const pullRequest: PullRequestSummary = {
  ref: { repository: { workspace: "acme", slug: "review" }, id: 7 },
  title: "Review this change",
  description: "Line one\n\nLine two",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer-a", "reviewer-b"],
};

describe("DescriptionTab", () => {
  afterEach(() => cleanup());

  it("renders the description as plain text and the branch/reviewer metadata", () => {
    render(
      <DescriptionTab
        pullRequest={pullRequest}
        currentUserId="reviewer-a"
        signalsState={{ status: "loaded", signals: [] }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Line one")).toBeInTheDocument();
    expect(screen.getByText("Line two")).toBeInTheDocument();
    expect(screen.getByText("feature/review → main")).toBeInTheDocument();
    expect(screen.getByText("reviewer-a (you)")).toBeInTheDocument();
    expect(screen.getByText("reviewer-b")).toBeInTheDocument();
  });

  it("shows the empty-description copy when there is no description", () => {
    render(
      <DescriptionTab
        pullRequest={{ ...pullRequest, description: "" }}
        currentUserId="reviewer-a"
        signalsState={{ status: "loaded", signals: [] }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("No description provided.")).toBeInTheDocument();
  });

  it("never executes literal HTML in the description and creates no img element", () => {
    const withMarkup = {
      ...pullRequest,
      description: '<img src="https://evil.example/x.png" onerror="window.__pwned=true">',
    };
    render(
      <DescriptionTab
        pullRequest={withMarkup}
        currentUserId="reviewer-a"
        signalsState={{ status: "loaded", signals: [] }}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText('<img src="https://evil.example/x.png" onerror="window.__pwned=true">'),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("renders a decision chip per reviewer from the latest matching signal", () => {
    const signals: ReviewSignal[] = [
      {
        id: "1",
        kind: "changes_requested",
        actorId: "reviewer-a",
        createdAt: "2026-08-29T09:00:00Z",
      },
      { id: "2", kind: "approved", actorId: "reviewer-a", createdAt: "2026-08-29T10:00:00Z" },
    ];
    render(
      <DescriptionTab
        pullRequest={pullRequest}
        currentUserId="reviewer-a"
        signalsState={{ status: "loaded", signals }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("No decision yet")).toBeInTheDocument();
  });

  it("shows an honest loading state instead of misrepresenting missing signals as decisions", () => {
    render(
      <DescriptionTab
        pullRequest={pullRequest}
        currentUserId="reviewer-a"
        signalsState={undefined}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.queryByText("No decision yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });

  it("shows a sanitized error with a Retry action that calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <DescriptionTab
        pullRequest={pullRequest}
        currentUserId="reviewer-a"
        signalsState={{ status: "error", error: "Unable to load review activity." }}
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Unable to load review activity.");
    expect(screen.queryByText("No decision yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders no reviewer section at all when there are no reviewers, regardless of signals state", () => {
    render(
      <DescriptionTab
        pullRequest={{ ...pullRequest, reviewerIds: [] }}
        currentUserId="reviewer-a"
        signalsState={undefined}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Reviewers" })).not.toBeInTheDocument();
  });
});
