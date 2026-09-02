import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeReviewProvider, PullRequestSummary, ReviewSignal } from "../providers/contracts";
import type { ProviderError } from "../providers/errors";
import { Overview } from "./Overview";

const forbidden: ProviderError = {
  _tag: "Forbidden",
  message: "Provider denied the requested permission",
  operation: "review signals",
  status: 403,
};

const basePullRequest: PullRequestSummary = {
  ref: { repository: { workspace: "acme", slug: "review" }, id: 7 },
  title: "Review this change",
  description: "Adds a widget.",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["dana", "sam"],
};

const providerWith = (
  getReviewSignals: CodeReviewProvider["getReviewSignals"],
): CodeReviewProvider => ({
  id: "test",
  capabilities: { canReadPullRequests: true, canReadReviewSignals: true, canWriteReviews: false },
  getCurrentUser: Effect.succeed({ id: "dana", displayName: "Dana" }),
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
});

const renderOverview = (
  provider: CodeReviewProvider,
  pullRequest: PullRequestSummary = basePullRequest,
): void => {
  render(<Overview provider={provider} pullRequest={pullRequest} currentUserId="dana" />);
};

describe("Overview", () => {
  afterEach(() => cleanup());

  it("renders a loading state before signals arrive", () => {
    renderOverview(providerWith(() => Effect.never));
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders an error state when the fetch fails", async () => {
    renderOverview(providerWith(() => Effect.fail(forbidden)));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unable to load/i));
  });

  it("renders the description as literal text, never as executed HTML", async () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    renderOverview(
      providerWith(() => Effect.succeed([])),
      {
        ...basePullRequest,
        description: hostile,
      },
    );
    await waitFor(() => expect(screen.getByText(hostile)).toBeInTheDocument());
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders the source to target branch relationship", async () => {
    renderOverview(providerWith(() => Effect.succeed([])));
    await waitFor(() =>
      expect(screen.getByText(/feature\/review/)).toHaveTextContent("feature/review → main"),
    );
  });

  it("renders one row per reviewer with their latest decision", async () => {
    const signals: ReadonlyArray<ReviewSignal> = [
      { id: "1", kind: "changes_requested", actorId: "dana", createdAt: "2026-08-29T09:00:00Z" },
      { id: "2", kind: "approved", actorId: "dana", createdAt: "2026-08-29T11:00:00Z" },
      { id: "3", kind: "commented", actorId: "sam", createdAt: "2026-08-29T10:00:00Z", text: "hi" },
    ];
    renderOverview(providerWith(() => Effect.succeed(signals)));

    const reviewers = await screen.findByRole("list", { name: /reviewers/i });
    const rows = within(reviewers).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/dana/i);
    expect(rows[0]).toHaveTextContent(/approved/i);
    expect(rows[1]).toHaveTextContent(/sam/i);
    expect(rows[1]).toHaveTextContent(/no decision yet/i);
  });

  it("renders the activity feed oldest to newest with actor, time, and text", async () => {
    const signals: ReadonlyArray<ReviewSignal> = [
      {
        id: "b",
        kind: "commented",
        actorId: "sam",
        createdAt: "2026-08-29T12:00:00Z",
        text: "second",
      },
      {
        id: "a",
        kind: "commented",
        actorId: "dana",
        createdAt: "2026-08-29T08:00:00Z",
        text: "first",
      },
    ];
    renderOverview(providerWith(() => Effect.succeed(signals)));

    const feed = await screen.findByRole("list", { name: /activity/i });
    const items = within(feed).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("first");
    expect(items[0]).toHaveTextContent(/dana/i);
    expect(items[1]).toHaveTextContent("second");
    expect(items[0].querySelector("time")).not.toBeNull();
  });

  it("renders an empty activity state when there are no signals", async () => {
    renderOverview(providerWith(() => Effect.succeed([])));
    await waitFor(() => expect(screen.getByText(/no activity yet/i)).toBeInTheDocument());
  });
});
