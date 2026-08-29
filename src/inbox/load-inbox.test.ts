import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { CodeReviewProvider, PullRequestSummary, RepositoryRef } from "../providers/contracts";
import { loadInbox } from "./load-inbox";

const goodRepository: RepositoryRef = { workspace: "acme", slug: "good" };
const badRepository: RepositoryRef = { workspace: "acme", slug: "bad" };
const pullRequest: PullRequestSummary = {
  ref: { repository: goodRepository, id: 7 },
  title: "Keep successful results",
  description: "",
  state: "OPEN",
  updatedAt: "2026-08-29T10:00:00Z",
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer"],
};

const provider = (overrides: Partial<CodeReviewProvider> = {}): CodeReviewProvider => ({
  id: "test",
  capabilities: {
    canReadPullRequests: true,
    canReadReviewSignals: false,
    canWriteReviews: false,
  },
  getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
  discoverRepositories: () =>
    Effect.succeed({
      workspaces: ["acme"],
      repositories: [goodRepository, badRepository],
      failures: [],
    }),
  listOpenPullRequests: (repository) =>
    repository.slug === "bad"
      ? Effect.fail({
          _tag: "Forbidden",
          message: "Provider denied the requested permission",
          operation: "open pull requests",
          status: 403,
        })
      : Effect.succeed([pullRequest]),
  getReviewSignals: () => Effect.succeed([]),
  getPullRequestDiff: () => Effect.succeed(""),
  approvePullRequest: () => Effect.void,
  requestChanges: () => Effect.void,
  addGeneralComment: () => Effect.void,
  addInlineComment: () => Effect.void,
  ...overrides,
});

describe("loadInbox", () => {
  it("keeps successful repository results visible when another repository fails", async () => {
    await expect(Effect.runPromise(loadInbox(provider()))).resolves.toEqual({
      pullRequests: [pullRequest],
      failures: [{ repository: badRepository, errorTag: "Forbidden" }],
    });
  });
});
