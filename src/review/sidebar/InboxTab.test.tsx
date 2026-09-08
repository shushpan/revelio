import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxLoadSnapshot } from "../../inbox/load-inbox";
import type { PullRequestSummary } from "../../providers/contracts";
import { InboxTab } from "./InboxTab";

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
    reviewerIds: ["reviewer"],
  };
}

function buildInbox(overrides: Partial<InboxLoadSnapshot> = {}): InboxLoadSnapshot {
  return {
    pullRequests: [],
    validCheckpointKeys: [],
    resolvedRepositoryKeys: [],
    failures: [],
    totalRepositories: 1,
    completedRepositories: 1,
    isComplete: true,
    ...overrides,
  };
}

const first = makePullRequest(1, "First PR");
const second = makePullRequest(2, "Second PR");

describe("InboxTab", () => {
  afterEach(() => cleanup());

  it("renders actionable pull requests oldest first with the current one marked", () => {
    const newer = { ...first, updatedAt: "2026-09-02T00:00:00Z" };
    const older = { ...second, updatedAt: "2026-09-01T00:00:00Z" };
    render(
      <InboxTab
        inbox={buildInbox({ pullRequests: [newer, older] })}
        currentUserId="reviewer"
        currentPullRequest={older}
        onSelectPullRequest={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName(/Second PR/);
    expect(rows[1]).toHaveAccessibleName(/First PR/);
    const current = screen.getByRole("button", { name: /Second PR/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /First PR/ })).not.toHaveAttribute("aria-current");
  });

  it("calls onSelectPullRequest with the chosen pull request", () => {
    const onSelectPullRequest = vi.fn();
    render(
      <InboxTab
        inbox={buildInbox({ pullRequests: [first, second] })}
        currentUserId="reviewer"
        currentPullRequest={first}
        onSelectPullRequest={onSelectPullRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Second PR/ }));
    expect(onSelectPullRequest).toHaveBeenCalledWith(second);
  });

  it("disables every row while busy", () => {
    render(
      <InboxTab
        inbox={buildInbox({ pullRequests: [first, second] })}
        currentUserId="reviewer"
        currentPullRequest={first}
        onSelectPullRequest={vi.fn()}
        busy
      />,
    );

    expect(screen.getByRole("button", { name: /Second PR/ })).toBeDisabled();
  });

  it("excludes a pull request once its checkpoint is valid, without dropping the others", () => {
    render(
      <InboxTab
        inbox={buildInbox({
          pullRequests: [first, second],
          validCheckpointKeys: ["acme/widgets#1"],
        })}
        currentUserId="reviewer"
        currentPullRequest={second}
        onSelectPullRequest={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /First PR/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second PR/ })).toBeInTheDocument();
  });

  it("shows a manually opened pull request alone when it is not itself actionable", () => {
    const unrelated = { ...makePullRequest(3, "Unrelated PR"), reviewerIds: [] };
    render(
      <InboxTab
        inbox={buildInbox({ pullRequests: [first, second, unrelated] })}
        currentUserId="reviewer"
        currentPullRequest={unrelated}
        onSelectPullRequest={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Unrelated PR/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByRole("button", { name: /First PR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Second PR/ })).not.toBeInTheDocument();
  });

  it("shows the incomplete-load status and failure count honestly when the snapshot is partial", () => {
    render(
      <InboxTab
        inbox={buildInbox({
          pullRequests: [first],
          isComplete: false,
          totalRepositories: 3,
          completedRepositories: 1,
          failures: [
            {
              repository: { workspace: "acme", slug: "widgets" },
              errorTag: "ServerError",
            },
          ],
        })}
        currentUserId="reviewer"
        currentPullRequest={first}
        onSelectPullRequest={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText(/Loaded 1 of 3 repositories/)).toBeInTheDocument();
    expect(screen.getByText(/1 repositories could not be loaded/)).toBeInTheDocument();
  });
});
