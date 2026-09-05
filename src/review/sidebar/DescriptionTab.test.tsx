import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
    render(<DescriptionTab pullRequest={pullRequest} currentUserId="reviewer-a" signals={[]} />);

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
        signals={[]}
      />,
    );

    expect(screen.getByText("No description provided.")).toBeInTheDocument();
  });

  it("never executes literal HTML in the description and creates no img element", () => {
    const withMarkup = {
      ...pullRequest,
      description: '<img src="https://evil.example/x.png" onerror="window.__pwned=true">',
    };
    render(<DescriptionTab pullRequest={withMarkup} currentUserId="reviewer-a" signals={[]} />);

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
      <DescriptionTab pullRequest={pullRequest} currentUserId="reviewer-a" signals={signals} />,
    );

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("No decision yet")).toBeInTheDocument();
  });
});
