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
  resolvedRepositoryKeys: [],
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

  it("filters rows by the query text field", () => {
    renderInbox({
      pullRequests: [
        pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
        pullRequestFor("repo-b", "2026-08-28T10:00:00Z"),
      ],
      totalRepositories: 2,
      completedRepositories: 2,
      isComplete: true,
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "repo:repo-a" } });

    expect(screen.getByText("PR for repo-a")).toBeInTheDocument();
    expect(screen.queryByText("PR for repo-b")).not.toBeInTheDocument();
  });

  it("shows matching of total actionable counts when narrowed", () => {
    renderInbox({
      pullRequests: [
        pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
        pullRequestFor("repo-b", "2026-08-28T10:00:00Z"),
      ],
      totalRepositories: 2,
      completedRepositories: 2,
      isComplete: true,
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "repo:repo-a" } });

    expect(screen.getByText(/Showing 1 of 2 actionable\./)).toBeInTheDocument();
  });

  it("offers only shortcuts that the loaded pull request data supports", () => {
    renderInbox();

    expect(screen.getByRole("button", { name: "Requested" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unreviewed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reviewed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Direct" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New commits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CI failed" })).not.toBeInTheDocument();
  });

  it("keeps rows visible and explains unsupported filters instead of showing a false empty result", () => {
    renderInbox({
      pullRequests: [pullRequestFor("repo-a", "2026-08-29T10:00:00Z")],
      totalRepositories: 1,
      completedRepositories: 1,
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ci:failed" } });

    expect(screen.getByText("Unsupported filter: ci:failed.")).toHaveAttribute("role", "status");
    expect(screen.getByText("PR for repo-a")).toBeInTheDocument();
    expect(screen.queryByText("No pull requests in this view.")).not.toBeInTheDocument();
  });

  it("does not pair invalid-query feedback with normal empty-state copy", () => {
    renderInbox();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ci:" } });

    expect(screen.getByText("Unsupported filter: ci:.")).toHaveAttribute("role", "status");
    expect(screen.queryByText("No pull requests in this view.")).not.toBeInTheDocument();
  });

  it("toggles a quick filter term into and out of the query field", () => {
    renderInbox();
    const requested = screen.getByRole("button", { name: "Requested" });
    const search = screen.getByRole("searchbox") as HTMLInputElement;

    expect(requested).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(requested);
    expect(search.value).not.toContain("reviewer:@me");
    expect(requested).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(requested);
    expect(search.value).toContain("reviewer:@me");
  });

  it("switches between reviewed and unreviewed rows through the review-state controls", () => {
    const unreviewed = pullRequestFor("unreviewed", "2026-08-29T10:00:00Z");
    const reviewed = pullRequestFor("reviewed", "2026-08-28T10:00:00Z");
    render(
      <InboxScreen
        user={user}
        inbox={snapshot({
          pullRequests: [unreviewed, reviewed],
          totalRepositories: 2,
          completedRepositories: 2,
        })}
        reviewed={{ "acme/reviewed#1": "abc123" }}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
      />,
    );
    const search = screen.getByRole("searchbox") as HTMLInputElement;
    const reviewedButton = screen.getByRole("button", { name: "Reviewed" });
    const unreviewedButton = screen.getByRole("button", { name: "Unreviewed" });

    expect(screen.getByText("PR for unreviewed")).toBeInTheDocument();
    expect(screen.queryByText("PR for reviewed")).not.toBeInTheDocument();

    fireEvent.click(reviewedButton);

    expect(search.value).toBe("reviewer:@me is:reviewed");
    expect(reviewedButton).toHaveAttribute("aria-pressed", "true");
    expect(unreviewedButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("PR for unreviewed")).not.toBeInTheDocument();
    expect(screen.getByText("PR for reviewed")).toBeInTheDocument();

    fireEvent.click(unreviewedButton);

    expect(search.value).toBe("reviewer:@me is:unreviewed");
    expect(unreviewedButton).toHaveAttribute("aria-pressed", "true");
    expect(reviewedButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("PR for unreviewed")).toBeInTheDocument();
    expect(screen.queryByText("PR for reviewed")).not.toBeInTheDocument();
  });

  it("replaces a mixed-case review-state term when selecting Reviewed", () => {
    const unreviewed = pullRequestFor("unreviewed", "2026-08-29T10:00:00Z");
    const reviewed = pullRequestFor("reviewed", "2026-08-28T10:00:00Z");
    render(
      <InboxScreen
        user={user}
        inbox={snapshot({
          pullRequests: [unreviewed, reviewed],
          totalRepositories: 2,
          completedRepositories: 2,
        })}
        reviewed={{ "acme/reviewed#1": "abc123" }}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
      />,
    );
    const search = screen.getByRole("searchbox") as HTMLInputElement;

    fireEvent.change(search, { target: { value: "reviewer:@me is:Unreviewed" } });
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    expect(search.value).toBe("reviewer:@me is:reviewed");
    expect(screen.queryByText("PR for unreviewed")).not.toBeInTheDocument();
    expect(screen.getByText("PR for reviewed")).toBeInTheDocument();
  });

  it("replaces quoted mixed-case review states while preserving other filters", () => {
    const unreviewed = pullRequestFor("unreviewed", "2026-08-29T10:00:00Z");
    const reviewed = pullRequestFor("reviewed", "2026-08-28T10:00:00Z");
    render(
      <InboxScreen
        user={user}
        inbox={snapshot({
          pullRequests: [unreviewed, reviewed],
          totalRepositories: 2,
          completedRepositories: 2,
        })}
        reviewed={{ "acme/reviewed#1": "abc123" }}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
      />,
    );
    const search = screen.getByRole("searchbox") as HTMLInputElement;

    fireEvent.change(search, {
      target: { value: 'reviewer:@me is:"Unreviewed" workspace:acme' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reviewed" }));

    expect(search.value).toBe("reviewer:@me workspace:acme is:reviewed");
    expect(screen.queryByText("PR for unreviewed")).not.toBeInTheDocument();
    expect(screen.getByText("PR for reviewed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unreviewed" }));

    expect(search.value).toBe("reviewer:@me workspace:acme is:unreviewed");
    expect(screen.getByText("PR for unreviewed")).toBeInTheDocument();
    expect(screen.queryByText("PR for reviewed")).not.toBeInTheDocument();
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
