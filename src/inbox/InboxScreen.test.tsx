import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderUser, PullRequestSummary } from "../providers/contracts";
import { InboxScreen } from "./InboxScreen";
import type { InboxLoadSnapshot } from "./load-inbox";

const user: ProviderUser = { id: "reviewer", displayName: "Reviewer" };

const pullRequestFor = (slug: string, updatedAt: string): PullRequestSummary => ({
  ref: { repository: { workspace: "acme", slug }, id: 1 },
  title: `PR for ${slug}`,
  description: "",
  state: "OPEN",
  updatedAt,
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer"],
});

const snapshot = (overrides: Partial<InboxLoadSnapshot> = {}): InboxLoadSnapshot => ({
  pullRequests: [],
  failures: [],
  totalRepositories: 0,
  completedRepositories: 0,
  isComplete: true,
  ...overrides,
});

const renderInbox = (overrides: Partial<InboxLoadSnapshot> = {}) =>
  render(
    <InboxScreen
      user={user}
      inbox={snapshot(overrides)}
      reviewed={{}}
      onSelect={vi.fn()}
      onRefresh={vi.fn()}
      onManageRepositories={vi.fn()}
      onLock={vi.fn()}
    />,
  );

describe("InboxScreen", () => {
  afterEach(() => cleanup());

  it("shows the truthful loaded status with completed/total counts and pull request total", () => {
    const pullRequest = pullRequestFor("repo-a", "2026-08-29T10:00:00Z");
    renderInbox({
      pullRequests: [pullRequest],
      totalRepositories: 38,
      completedRepositories: 12,
      isComplete: false,
    });

    expect(
      screen.getByText("Loaded 12 of 38 repositories - 1 pull requests found."),
    ).toBeInTheDocument();
  });

  it("never shows empty copy while repositories are still pending", () => {
    renderInbox({ totalRepositories: 2, completedRepositories: 1, isComplete: false });

    expect(screen.queryByText("No pull requests in this view.")).not.toBeInTheDocument();
  });

  it("never shows empty copy when a repository failed, even after completion", () => {
    renderInbox({
      totalRepositories: 2,
      completedRepositories: 2,
      isComplete: true,
      failures: [{ repository: { workspace: "acme", slug: "bad" }, errorTag: "Forbidden" }],
    });

    expect(screen.queryByText("No pull requests in this view.")).not.toBeInTheDocument();
    expect(
      screen.getByText("Results are incomplete: 1 repositories could not be loaded."),
    ).toBeInTheDocument();
  });

  it("shows empty copy only once every selected repository succeeded with zero pull requests", () => {
    renderInbox({ totalRepositories: 2, completedRepositories: 2, isComplete: true });

    expect(screen.getByText("No pull requests in this view.")).toBeInTheDocument();
  });

  it("keeps successful rows visible alongside a partial failure", () => {
    const pullRequest = pullRequestFor("repo-a", "2026-08-29T10:00:00Z");
    renderInbox({
      pullRequests: [pullRequest],
      totalRepositories: 2,
      completedRepositories: 2,
      isComplete: true,
      failures: [{ repository: { workspace: "acme", slug: "bad" }, errorTag: "Forbidden" }],
    });

    expect(screen.getByText("PR for repo-a")).toBeInTheDocument();
  });

  it("calls onManageRepositories from the Manage repositories action", () => {
    const onManageRepositories = vi.fn();
    render(
      <InboxScreen
        user={user}
        inbox={snapshot()}
        reviewed={{}}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={onManageRepositories}
        onLock={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Manage repositories" }));
    expect(onManageRepositories).toHaveBeenCalled();
  });
});
