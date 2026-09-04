import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { CodeReviewProvider, PullRequestSummary, RepositoryRef } from "../providers/contracts";
import { type InboxLoadSnapshot, inboxHasConfirmedEmptyResult, loadInbox } from "./load-inbox";
import type { Checkpoint } from "./checkpoint";

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

const checkpointFor = (pullRequest: PullRequestSummary): Checkpoint => ({
  pullRequestKey: `acme/${pullRequest.ref.repository.slug}#${pullRequest.ref.id}`,
  reviewedHeadCommit: pullRequest.sourceCommit,
  watermark: "2026-08-28T10:00:00Z",
  outcome: "reviewed",
  finishedAt: "2026-08-28T10:00:00Z",
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
  listWorkspaces: () => Effect.succeed([]),
  listRepositories: () => Effect.succeed([]),
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
  it("only reads signals for checkpointed pull requests and exposes valid checkpoints", async () => {
    const repository = repositoryAt(0);
    const pullRequest = pullRequestFor(repository, "2026-08-29T10:00:00Z");
    const withoutCheckpoint = {
      ...pullRequest,
      ref: { ...pullRequest.ref, id: 2 },
      title: "PR without a checkpoint",
    };
    const getReviewSignals = vi.fn(() => Effect.succeed([]));
    const checkpoint: Checkpoint = {
      pullRequestKey: "acme/repo-0#1",
      reviewedHeadCommit: "abc123",
      watermark: "2026-08-28T10:00:00Z",
      outcome: "reviewed",
      finishedAt: "2026-08-28T10:00:00Z",
    };

    const snapshot = await Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: () => Effect.succeed([pullRequest, withoutCheckpoint]),
          getReviewSignals,
        }),
        [repository],
        { checkpoints: [checkpoint], currentUserId: "reviewer" },
      ),
    );

    expect(getReviewSignals).toHaveBeenCalledWith(pullRequest.ref);
    expect(getReviewSignals).toHaveBeenCalledTimes(1);
    expect(snapshot.validCheckpointKeys).toEqual([checkpoint.pullRequestKey]);
  });

  it("keeps a checkpointed pull request actionable when its signals cannot load", async () => {
    const repository = repositoryAt(0);
    const pullRequest = pullRequestFor(repository, "2026-08-29T10:00:00Z");
    const checkpoint: Checkpoint = {
      pullRequestKey: "acme/repo-0#1",
      reviewedHeadCommit: "abc123",
      watermark: "2026-08-28T10:00:00Z",
      outcome: "reviewed",
      finishedAt: "2026-08-28T10:00:00Z",
    };

    const snapshot = await Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
          getReviewSignals: () =>
            Effect.fail({
              _tag: "NetworkError",
              message: "Provider could not be reached",
              operation: "review signals",
              endpoint: "/signals",
            }),
        }),
        [repository],
        { checkpoints: [checkpoint], currentUserId: "reviewer" },
      ),
    );

    expect(snapshot.validCheckpointKeys).toEqual([]);
  });

  it("keeps checkpoints actionable after a new head or supported re-entry signal", async () => {
    const repository = repositoryAt(0);
    const pullRequest = pullRequestFor(repository, "2026-08-29T10:00:00Z");
    const checkpoint: Checkpoint = {
      pullRequestKey: "acme/repo-0#1",
      reviewedHeadCommit: "abc123",
      watermark: "2026-08-28T10:00:00Z",
      outcome: "reviewed",
      finishedAt: "2026-08-28T10:00:00Z",
    };

    const changedHead = await Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: () =>
            Effect.succeed([{ ...pullRequest, sourceCommit: "new-head" }]),
        }),
        [repository],
        { checkpoints: [checkpoint], currentUserId: "reviewer" },
      ),
    );
    const requestedAgain = await Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: () => Effect.succeed([pullRequest]),
          getReviewSignals: () =>
            Effect.succeed([
              {
                id: "requested-again",
                kind: "requested" as const,
                actorId: "author",
                createdAt: "2026-08-29T10:00:00Z",
              },
            ]),
        }),
        [repository],
        { checkpoints: [checkpoint], currentUserId: "reviewer" },
      ),
    );

    expect(changedHead.validCheckpointKeys).toEqual([]);
    expect(requestedAgain.validCheckpointKeys).toEqual([]);
  });

  it("bounds checkpoint activity reads across all repository workers", async () => {
    const repositories = Array.from({ length: 5 }, (_, index) => repositoryAt(index));
    const pullRequests = repositories.flatMap((repository) =>
      Array.from({ length: 3 }, (_, index) => ({
        ...pullRequestFor(repository, "2026-08-29T10:00:00Z"),
        ref: { repository, id: index + 1 },
      })),
    );
    const releases = pullRequests.map(() => defer<ReadonlyArray<never>>());
    let active = 0;
    let activityReads = 0;
    let completedActivityReads = 0;
    let maxActive = 0;
    const firstFourStarted = defer<void>();

    const resultPromise = Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: (repository) =>
            Effect.succeed(
              pullRequests.filter((pullRequest) => pullRequest.ref.repository === repository),
            ),
          getReviewSignals: (ref) => {
            const index = pullRequests.findIndex(
              (pullRequest) =>
                pullRequest.ref.repository === ref.repository && pullRequest.ref.id === ref.id,
            );
            activityReads += 1;
            active += 1;
            maxActive = Math.max(maxActive, active);
            if (active === 4) firstFourStarted.resolve();
            return Effect.promise(async () => {
              const signals = await releases[index].promise;
              active -= 1;
              completedActivityReads += 1;
              return signals;
            });
          },
        }),
        repositories,
        { concurrency: 5, checkpoints: pullRequests.map(checkpointFor), currentUserId: "reviewer" },
      ),
    );

    await firstFourStarted.promise;
    expect(active).toBe(4);
    expect(maxActive).toBe(4);

    for (const release of releases) release.resolve([]);
    await resultPromise;

    expect(maxActive).toBe(4);
    expect(activityReads).toBe(pullRequests.length);
    expect(completedActivityReads).toBe(pullRequests.length);
  });

  it("does not start queued or subsequent activity reads after aborting", async () => {
    const repositories = Array.from({ length: 5 }, (_, index) => repositoryAt(index));
    const pullRequests = repositories.flatMap((repository, index) =>
      Array.from({ length: index === 0 ? 2 : 1 }, (_, pullRequestIndex) => ({
        ...pullRequestFor(repository, "2026-08-29T10:00:00Z"),
        ref: { repository, id: pullRequestIndex + 1 },
      })),
    );
    const controller = new AbortController();
    const release = defer<ReadonlyArray<never>>();
    const firstFourStarted = defer<void>();
    const snapshots: InboxLoadSnapshot[] = [];
    let activityReads = 0;

    const resultPromise = Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: (repository) =>
            Effect.succeed(
              pullRequests.filter((pullRequest) => pullRequest.ref.repository === repository),
            ),
          getReviewSignals: () => {
            activityReads += 1;
            if (activityReads === 4) firstFourStarted.resolve();
            return Effect.promise(() => release.promise);
          },
        }),
        repositories,
        {
          concurrency: 5,
          signal: controller.signal,
          checkpoints: pullRequests.map(checkpointFor),
          currentUserId: "reviewer",
          onSnapshot: (snapshot) => snapshots.push(snapshot),
        },
      ),
    );

    await firstFourStarted.promise;
    controller.abort();
    release.resolve([]);
    await resultPromise;

    expect(activityReads).toBe(4);
    expect(snapshots).toEqual([]);
  });

  it("emits a fast repository's validated snapshot while another repository's activity reads wait", async () => {
    const slowRepository = repositoryAt(0);
    const fastRepository = repositoryAt(1);
    const slowPullRequests = [1, 2].map((id) => ({
      ...pullRequestFor(slowRepository, "2026-08-29T10:00:00Z"),
      ref: { repository: slowRepository, id },
    }));
    const fastPullRequest = pullRequestFor(fastRepository, "2026-08-29T10:00:00Z");
    const slowRelease = defer<ReadonlyArray<never>>();
    const firstSlowStarted = defer<void>();
    const fastValidationStarted = defer<void>();
    const fastSnapshot = defer<InboxLoadSnapshot>();

    const resultPromise = Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: (repository) => {
            if (repository === slowRepository) return Effect.succeed(slowPullRequests);
            return Effect.promise(async () => {
              await firstSlowStarted.promise;
              return [fastPullRequest];
            });
          },
          getReviewSignals: (ref) => {
            if (ref.repository === fastRepository) {
              fastValidationStarted.resolve();
              return Effect.succeed([]);
            }
            firstSlowStarted.resolve();
            return Effect.promise(() => slowRelease.promise);
          },
        }),
        [slowRepository, fastRepository],
        {
          concurrency: 2,
          checkpoints: [...slowPullRequests, fastPullRequest].map(checkpointFor),
          currentUserId: "reviewer",
          onSnapshot: (snapshot) => {
            if (
              snapshot.validCheckpointKeys?.[0] === checkpointFor(fastPullRequest).pullRequestKey
            ) {
              fastSnapshot.resolve(snapshot);
            }
          },
        },
      ),
    );

    await firstSlowStarted.promise;
    await fastValidationStarted.promise;
    expect((await fastSnapshot.promise).completedRepositories).toBe(1);

    slowRelease.resolve([]);
    await resultPromise;
  });

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

  it("records an empty repository as resolved while another repository remains pending", async () => {
    const emptyRepository = repositoryAt(0);
    const pendingRepository = repositoryAt(1);
    const pending = defer<ReadonlyArray<PullRequestSummary>>();
    const firstSnapshot = defer<InboxLoadSnapshot>();

    const resultPromise = Effect.runPromise(
      loadInbox(
        provider({
          listOpenPullRequests: (repository) =>
            repository === emptyRepository
              ? Effect.succeed([])
              : Effect.promise(() => pending.promise),
        }),
        [emptyRepository, pendingRepository],
        {
          concurrency: 2,
          onSnapshot: (snapshot) => {
            if (snapshot.completedRepositories === 1) firstSnapshot.resolve(snapshot);
          },
        },
      ),
    );

    const snapshot = await firstSnapshot.promise;
    expect(snapshot.resolvedRepositoryKeys).toEqual([`acme${String.fromCodePoint(0)}repo-0`]);
    expect(Object.isFrozen(snapshot.resolvedRepositoryKeys)).toBe(true);

    pending.resolve([]);
    const finalSnapshot = await resultPromise;
    expect(finalSnapshot.resolvedRepositoryKeys).toEqual([
      `acme${String.fromCodePoint(0)}repo-0`,
      `acme${String.fromCodePoint(0)}repo-1`,
    ]);
    expect(Object.isFrozen(finalSnapshot.resolvedRepositoryKeys)).toBe(true);
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
    resolvedRepositoryKeys: [],
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
