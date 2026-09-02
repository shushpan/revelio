import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { CodeReviewProvider, PullRequestSummary, RepositoryRef } from "../providers/contracts";
import { type InboxLoadSnapshot, inboxHasConfirmedEmptyResult, loadInbox } from "./load-inbox";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const repositoryAt = (index: number): RepositoryRef => ({
  workspace: "acme",
  slug: `repo-${index}`,
});

const pullRequestFor = (repository: RepositoryRef, updatedAt: string): PullRequestSummary => ({
  ref: { repository, id: 1 },
  title: `PR for ${repository.slug}`,
  description: "",
  state: "OPEN",
  updatedAt,
  sourceBranch: "feature/review",
  targetBranch: "main",
  sourceCommit: "abc123",
  author: { id: "author", displayName: "Author" },
  reviewerIds: ["reviewer"],
});

const provider = (overrides: Partial<CodeReviewProvider> = {}): CodeReviewProvider => ({
  id: "test",
  capabilities: {
    canReadPullRequests: true,
    canReadReviewSignals: false,
    canWriteReviews: false,
  },
  getCurrentUser: Effect.succeed({ id: "reviewer", displayName: "Reviewer" }),
  discoverRepositories: () => Effect.succeed({ workspaces: [], repositories: [], failures: [] }),
  listOpenPullRequests: () => Effect.succeed([]),
  getReviewSignals: () => Effect.succeed([]),
  getPullRequestDiff: () => Effect.succeed(""),
  approvePullRequest: () => Effect.void,
  requestChanges: () => Effect.void,
  addGeneralComment: () => Effect.void,
  addInlineComment: () => Effect.void,
  ...overrides,
});

interface Deferred<A> {
  readonly promise: Promise<A>;
  resolve(value: A): void;
}

const defer = <A>(): Deferred<A> => {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("loadInbox", () => {
  it("runs at most four repository loads concurrently, four-wide", async () => {
    const repositories = Array.from({ length: 6 }, (_, index) => repositoryAt(index));
    const deferreds = repositories.map(() => defer<ReadonlyArray<PullRequestSummary>>());
    let active = 0;
    let maxActive = 0;

    const testProvider = provider({
      listOpenPullRequests: (repository) => {
        const index = repositories.findIndex((candidate) => candidate.slug === repository.slug);
        active += 1;
        maxActive = Math.max(maxActive, active);
        return Effect.promise(async () => {
          const result = await deferreds[index].promise;
          active -= 1;
          return result;
        });
      },
    });

    const resultPromise = Effect.runPromise(loadInbox(testProvider, repositories));

    await tick();
    expect(active).toBe(4);

    deferreds[0].resolve([]);
    await tick();
    expect(active).toBe(4);
    expect(maxActive).toBe(4);

    for (const deferred of deferreds.slice(1)) {
      deferred.resolve([]);
    }
    const snapshot = await resultPromise;

    expect(maxActive).toBe(4);
    expect(snapshot.completedRepositories).toBe(6);
    expect(snapshot.isComplete).toBe(true);
  });

  it("emits a snapshot with the first success before a later repository resolves", async () => {
    const repositories = [repositoryAt(0), repositoryAt(1)];
    const second = defer<ReadonlyArray<PullRequestSummary>>();
    const snapshots: InboxLoadSnapshot[] = [];

    const testProvider = provider({
      listOpenPullRequests: (repository) =>
        repository.slug === "repo-0"
          ? Effect.succeed([pullRequestFor(repository, "2026-08-29T10:00:00Z")])
          : Effect.promise(() => second.promise),
    });

    const resultPromise = Effect.runPromise(
      loadInbox(testProvider, repositories, {
        concurrency: 2,
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      }),
    );

    await tick();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].completedRepositories).toBe(1);
    expect(snapshots[0].pullRequests).toHaveLength(1);
    expect(snapshots[0].isComplete).toBe(false);

    second.resolve([]);
    const finalSnapshot = await resultPromise;

    expect(finalSnapshot.isComplete).toBe(true);
    expect(finalSnapshot.completedRepositories).toBe(2);
  });

  it("keeps a sanitized failure without failing the effect", async () => {
    const goodRepository = repositoryAt(0);
    const badRepository = repositoryAt(1);
    const pullRequest = pullRequestFor(goodRepository, "2026-08-29T10:00:00Z");

    const testProvider = provider({
      listOpenPullRequests: (repository) =>
        repository.slug === badRepository.slug
          ? Effect.fail({
              _tag: "Forbidden",
              message: "Provider denied the requested permission",
              operation: "open pull requests",
              status: 403,
            })
          : Effect.succeed([pullRequest]),
    });

    const snapshot = await Effect.runPromise(
      loadInbox(testProvider, [goodRepository, badRepository]),
    );

    expect(snapshot.pullRequests).toEqual([pullRequest]);
    expect(snapshot.failures).toEqual([{ repository: badRepository, errorTag: "Forbidden" }]);
    expect(snapshot.completedRepositories).toBe(2);
    expect(snapshot.isComplete).toBe(true);
  });

  it("sorts pull requests by updated timestamp descending, then workspace/slug/id", async () => {
    const older = repositoryAt(0);
    const newer = repositoryAt(1);
    const olderPr = pullRequestFor(older, "2026-08-01T00:00:00Z");
    const newerPr = pullRequestFor(newer, "2026-08-29T00:00:00Z");

    const testProvider = provider({
      listOpenPullRequests: (repository) =>
        Effect.succeed(repository.slug === older.slug ? [olderPr] : [newerPr]),
    });

    const snapshot = await Effect.runPromise(loadInbox(testProvider, [older, newer]));

    expect(snapshot.pullRequests).toEqual([newerPr, olderPr]);
  });

  it("stops emitting snapshots once the caller aborts and never starts remaining repositories", async () => {
    const repositories = [repositoryAt(0), repositoryAt(1)];
    const first = defer<ReadonlyArray<PullRequestSummary>>();
    const controller = new AbortController();
    const snapshots: InboxLoadSnapshot[] = [];
    let secondCalled = false;

    const testProvider = provider({
      listOpenPullRequests: (repository) => {
        if (repository.slug === "repo-1") {
          secondCalled = true;
        }
        return Effect.promise(() => first.promise);
      },
    });

    const resultPromise = Effect.runPromise(
      loadInbox(testProvider, repositories, {
        concurrency: 1,
        signal: controller.signal,
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      }),
    );

    await tick();
    controller.abort();
    first.resolve([]);
    await resultPromise;

    expect(secondCalled).toBe(false);
    expect(snapshots).toHaveLength(0);
  });
});

describe("inboxHasConfirmedEmptyResult", () => {
  const base: InboxLoadSnapshot = {
    pullRequests: [],
    failures: [],
    totalRepositories: 2,
    completedRepositories: 0,
    isComplete: false,
  };

  it("is false while repositories are still pending", () => {
    expect(inboxHasConfirmedEmptyResult({ ...base, completedRepositories: 1 })).toBe(false);
  });

  it("is false when a repository failed, even after completion", () => {
    expect(
      inboxHasConfirmedEmptyResult({
        ...base,
        completedRepositories: 2,
        isComplete: true,
        failures: [{ repository: repositoryAt(0), errorTag: "Forbidden" }],
      }),
    ).toBe(false);
  });

  it("is true when complete with zero failures and zero pull requests", () => {
    expect(
      inboxHasConfirmedEmptyResult({ ...base, completedRepositories: 2, isComplete: true }),
    ).toBe(true);
  });

  it("is false when complete with pull requests present", () => {
    const repository = repositoryAt(0);
    expect(
      inboxHasConfirmedEmptyResult({
        ...base,
        completedRepositories: 2,
        isComplete: true,
        pullRequests: [pullRequestFor(repository, "2026-08-29T10:00:00Z")],
      }),
    ).toBe(false);
  });
});
