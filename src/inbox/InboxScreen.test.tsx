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
      theme="system"
      resolvedTheme="light"
      onThemeChange={vi.fn()}
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
      screen.getByText("Results are incomplete: 1 repositories could not be loaded (acme/bad)."),
    ).toBeInTheDocument();
  });

  it("names every failed repository, not just a count", () => {
    renderInbox({
      totalRepositories: 3,
      completedRepositories: 3,
      isComplete: true,
      failures: [
        { repository: { workspace: "acme", slug: "bad" }, errorTag: "Forbidden" },
        { repository: { workspace: "acme", slug: "worse" }, errorTag: "ServerError" },
      ],
    });

    expect(
      screen.getByText(
        "Results are incomplete: 2 repositories could not be loaded (acme/bad, acme/worse).",
      ),
    ).toBeInTheDocument();
  });

  it("shows a fixed number of row skeletons while loading, without hiding rows already loaded", () => {
    const loaded = pullRequestFor("repo-a", "2026-08-29T10:00:00Z");
    renderInbox({
      pullRequests: [loaded],
      totalRepositories: 3,
      completedRepositories: 1,
      isComplete: false,
    });

    expect(screen.getByText("PR for repo-a")).toBeInTheDocument();
    const list = document.querySelector(".inbox-list");
    expect(list?.querySelectorAll(".inbox-row-skeleton")).toHaveLength(3);
  });

  it("renders no skeletons once loading is complete", () => {
    renderInbox({ totalRepositories: 1, completedRepositories: 1, isComplete: true });

    expect(document.querySelectorAll(".inbox-row-skeleton")).toHaveLength(0);
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
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
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
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
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
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
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
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Manage repositories" }));
    expect(onManageRepositories).toHaveBeenCalled();
  });

  it("calls onRefresh from the Refresh action", () => {
    const onRefresh = vi.fn();
    render(
      <InboxScreen
        user={user}
        inbox={snapshot()}
        reviewed={{}}
        onSelect={vi.fn()}
        onRefresh={onRefresh}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("calls onLock from the Lock action", () => {
    const onLock = vi.fn();
    render(
      <InboxScreen
        user={user}
        inbox={snapshot()}
        reviewed={{}}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={onLock}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(onLock).toHaveBeenCalled();
  });

  it("renders the dense toolbar as a header inside the full-screen inbox surface, with the shared theme control", () => {
    renderInbox();

    const main = document.querySelector("main.inbox-page");
    const toolbar = main?.querySelector("header.inbox-toolbar");
    expect(toolbar).not.toBeNull();
    expect(toolbar).toContainElement(screen.getByRole("heading", { name: "Open pull requests" }));
    expect(toolbar).toContainElement(screen.getByRole("searchbox"));
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "Requested" }));
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "Manage repositories" }));
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "System" }));
  });

  it("calls the shared theme control's onThemeChange with existing semantics", () => {
    const onThemeChange = vi.fn();
    render(
      <InboxScreen
        user={user}
        inbox={snapshot()}
        reviewed={{}}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={onThemeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("shows dense row metadata: repository, author, pull request state, and reviewer status", () => {
    const pullRequest = {
      ...pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
      reviewerIds: ["REVIEWER"],
    };
    renderInbox({
      pullRequests: [pullRequest],
      totalRepositories: 1,
      completedRepositories: 1,
    });

    const row = screen.getByRole("button", { name: /PR for repo-a/ });
    expect(row).toHaveTextContent("acme/repo-a");
    expect(row).toHaveTextContent("#1");
    expect(row).toHaveTextContent("Author");
    expect(row).toHaveTextContent("OPEN");
    expect(row).toHaveTextContent("Needs my review");
  });

  it("shows Authored by me instead of a review request when the current user wrote the pull request", () => {
    const authored = {
      ...pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
      author: { id: "reviewer", displayName: "Reviewer" },
      reviewerIds: [],
    };
    renderInbox({ pullRequests: [authored], totalRepositories: 1, completedRepositories: 1 });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });

    const row = screen.getByRole("button", { name: /PR for repo-a/ });
    expect(row).toHaveTextContent("Authored by me");
    expect(row).not.toHaveTextContent("Needs my review");
  });

  it("shows no attention chip for a pull request that neither requests nor was authored by the current user", () => {
    const other = {
      ...pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
      author: { id: "someone-else", displayName: "Someone Else" },
      reviewerIds: [],
    };
    renderInbox({ pullRequests: [other], totalRepositories: 1, completedRepositories: 1 });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });

    const row = screen.getByRole("button", { name: /PR for repo-a/ });
    expect(row).not.toHaveTextContent("Needs my review");
    expect(row).not.toHaveTextContent("Authored by me");
  });

  it("shows a short relative age instead of an absolute date, keeping the exact date available", () => {
    const recent = pullRequestFor("repo-a", new Date(Date.now() - 5 * 60_000).toISOString());
    renderInbox({ pullRequests: [recent], totalRepositories: 1, completedRepositories: 1 });

    const row = screen.getByRole("button", { name: /PR for repo-a/ });
    expect(row).toHaveTextContent("5m ago");
    const time = row.querySelector("time");
    expect(time).toHaveAttribute("title");
  });

  it("orders actionable requested/unreviewed work oldest first, ahead of reviewed rows", () => {
    const olderActionable = pullRequestFor("older", "2026-08-01T10:00:00Z");
    const newerActionable = pullRequestFor("newer", "2026-08-20T10:00:00Z");
    const reviewedRow = pullRequestFor("reviewed", "2026-08-30T10:00:00Z");
    render(
      <InboxScreen
        user={user}
        inbox={snapshot({
          pullRequests: [newerActionable, reviewedRow, olderActionable],
          totalRepositories: 3,
          completedRepositories: 3,
        })}
        reviewed={{ "acme/reviewed#1": "abc123" }}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onManageRepositories={vi.fn()}
        onLock={vi.fn()}
        theme="system"
        resolvedTheme="light"
        onThemeChange={vi.fn()}
      />,
    );
    // Clear the default "is:unreviewed" query so the already-reviewed row
    // stays visible too - ordering, not filtering, is what this test covers.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });

    const rows = screen.getAllByRole("button", { name: /PR for/ });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("PR for older");
    expect(rows[1]).toHaveTextContent("PR for newer");
    expect(rows[2]).toHaveTextContent("PR for reviewed");
  });

  it("focuses the query field when / is pressed outside an editable control", () => {
    renderInbox({
      pullRequests: [pullRequestFor("repo-a", "2026-08-29T10:00:00Z")],
      totalRepositories: 1,
      completedRepositories: 1,
    });

    fireEvent.keyDown(document.body, { key: "/" });

    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("does not steal / from an editable control the user is already typing in", () => {
    renderInbox({
      pullRequests: [pullRequestFor("repo-a", "2026-08-29T10:00:00Z")],
      totalRepositories: 1,
      completedRepositories: 1,
    });
    const search = screen.getByRole("searchbox");
    search.focus();

    fireEvent.keyDown(search, { key: "/" });

    expect(search).toHaveFocus();
  });

  it("moves focus through visible inbox rows with ArrowDown and ArrowUp", () => {
    renderInbox({
      pullRequests: [
        pullRequestFor("repo-a", "2026-08-29T10:00:00Z"),
        pullRequestFor("repo-b", "2026-08-28T10:00:00Z"),
      ],
      totalRepositories: 2,
      completedRepositories: 2,
    });
    const rows = screen.getAllByRole("button", { name: /PR for/ });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(rows[0]).toHaveFocus();

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(rows[1]).toHaveFocus();

    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(rows[0]).toHaveFocus();
  });
});
