import { Effect } from "effect";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, PullRequestSummary } from "../../providers/contracts";
import { type ActivityState, ActivityTab } from "./ActivityTab";

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

function provider(getReviewSignals: CodeReviewProvider["getReviewSignals"]): CodeReviewProvider {
  return {
    id: "test",
    capabilities: { canReadPullRequests: true, canReadReviewSignals: true, canWriteReviews: true },
    getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
    discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
    listWorkspaces: () => Effect.succeed([]),
    listRepositories: () => Effect.succeed([]),
    listOpenPullRequests: () => Effect.succeed([]),
    getReviewSignals,
    getPullRequestDiff: () => Effect.succeed(""),
    approvePullRequest: () => Effect.succeed(undefined),
    requestChanges: () => Effect.succeed(undefined),
    addGeneralComment: () => Effect.succeed(undefined),
    addInlineComment: () => Effect.succeed(undefined),
  };
}

describe("ActivityTab", () => {
  afterEach(() => cleanup());

  it("issues no request before the tab is ever activated", () => {
    const getReviewSignals = vi.fn(() => Effect.succeed([]));
    render(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active={false}
        cache={new Map<string, ActivityState>()}
      />,
    );

    expect(getReviewSignals).not.toHaveBeenCalled();
  });

  it("loads once on first activation and shows newest-first activity", async () => {
    const getReviewSignals = vi.fn(() =>
      Effect.succeed([
        {
          id: "1",
          kind: "commented" as const,
          actorId: "alice",
          createdAt: "2026-08-29T09:00:00Z",
        },
        { id: "2", kind: "approved" as const, actorId: "bob", createdAt: "2026-08-29T11:00:00Z" },
      ]),
    );
    render(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active
        cache={new Map<string, ActivityState>()}
      />,
    );

    await waitFor(() => expect(getReviewSignals).toHaveBeenCalledTimes(1));
    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("bob");
    expect(items[1]).toHaveTextContent("alice");
  });

  it("does not re-request when reactivated with a warm cache for the same PR", async () => {
    const getReviewSignals = vi.fn(() => Effect.succeed([]));
    const cache = new Map<string, ActivityState>();
    const { rerender } = render(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active
        cache={cache}
      />,
    );
    await waitFor(() => expect(getReviewSignals).toHaveBeenCalledTimes(1));

    rerender(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active={false}
        cache={cache}
      />,
    );
    rerender(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active
        cache={cache}
      />,
    );

    expect(getReviewSignals).toHaveBeenCalledTimes(1);
  });

  it("shows loading, then empty state, when there is no activity", async () => {
    const getReviewSignals = vi.fn(() => Effect.succeed([]));
    render(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active
        cache={new Map<string, ActivityState>()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });

  it("shows a sanitized error with retry that replaces only this PR's cache entry", async () => {
    const getReviewSignals = vi
      .fn()
      .mockReturnValueOnce(
        Effect.fail({ _tag: "Unavailable", message: "socket hang up at 10.0.0.4:443" }),
      )
      .mockReturnValueOnce(Effect.succeed([]));
    const cache = new Map<string, ActivityState>();
    render(
      <ActivityTab
        provider={provider(getReviewSignals)}
        pullRequest={pullRequest}
        active
        cache={cache}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load review activity.");
    expect(alert.textContent).not.toContain("10.0.0.4");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(getReviewSignals).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });
});
