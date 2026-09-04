import { Effect } from "effect";
import type {
  CodeReviewProvider,
  PullRequestSummary,
  RepositoryRef,
  ReviewSignal,
} from "../providers/contracts";
import type { ProviderError } from "../providers/errors";
import { type Checkpoint, isCheckpointValid } from "./checkpoint";
import { pullRequestKey } from "./query";

export interface InboxLoadFailure {
  readonly repository: RepositoryRef;
  readonly errorTag: ProviderError["_tag"];
}

export interface InboxLoadSnapshot {
  readonly pullRequests: ReadonlyArray<PullRequestSummary>;
  /** Checkpoints that remain valid after their review signals were read. */
  readonly validCheckpointKeys?: ReadonlyArray<string>;
  /** Repositories whose open-pull-request read has succeeded or failed. */
  readonly resolvedRepositoryKeys: ReadonlyArray<string>;
  readonly failures: ReadonlyArray<InboxLoadFailure>;
  readonly totalRepositories: number;
  readonly completedRepositories: number;
  readonly isComplete: boolean;
}

export interface LoadInboxOptions {
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onSnapshot?: (snapshot: InboxLoadSnapshot) => void;
  readonly checkpoints?: ReadonlyArray<Checkpoint>;
  readonly currentUserId?: string;
}

const compareRepositories = (a: RepositoryRef, b: RepositoryRef): number => {
  if (a.workspace !== b.workspace) return a.workspace < b.workspace ? -1 : 1;
  if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1;
  return 0;
};

const comparePullRequests = (a: PullRequestSummary, b: PullRequestSummary): number => {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  const repositoryOrder = compareRepositories(a.ref.repository, b.ref.repository);
  return repositoryOrder !== 0 ? repositoryOrder : a.ref.id - b.ref.id;
};

const repositoryKey = (repository: RepositoryRef): string =>
  [repository.workspace, repository.slug].join(String.fromCodePoint(0));

const activityReadConcurrency = 4;

const createActivityReadQueue = (concurrency: number, signal?: AbortSignal) => {
  const queued: Array<() => void> = [];
  let active = 0;

  const runNext = (): void => {
    if (signal?.aborted) {
      while (queued.length > 0) queued.shift()?.();
      return;
    }
    while (active < concurrency) {
      const next = queued.shift();
      if (!next) return;
      next();
    }
  };

  signal?.addEventListener("abort", runNext, { once: true });

  return <A>(read: () => Promise<A>): Promise<A | undefined> =>
    new Promise((resolve, reject) => {
      queued.push(() => {
        if (signal?.aborted) {
          resolve(undefined);
          return;
        }
        active += 1;
        void (async () => {
          try {
            resolve(await read());
          } catch (error) {
            reject(error);
          } finally {
            active -= 1;
            runNext();
          }
        })();
      });
      runNext();
    });
};

const runLoad = async (
  provider: CodeReviewProvider,
  repositories: ReadonlyArray<RepositoryRef>,
  options: LoadInboxOptions,
): Promise<InboxLoadSnapshot> => {
  const totalRepositories = repositories.length;
  const pullRequests: PullRequestSummary[] = [];
  const validCheckpointKeys = new Set<string>();
  const resolvedRepositoryKeys = new Set<string>();
  const checkpoints = new Map(
    (options.checkpoints ?? []).map((checkpoint) => [checkpoint.pullRequestKey, checkpoint]),
  );
  const failures: InboxLoadFailure[] = [];
  let completedRepositories = 0;
  const scheduleActivityRead = createActivityReadQueue(activityReadConcurrency, options.signal);

  const snapshot = (): InboxLoadSnapshot =>
    Object.freeze({
      pullRequests: Object.freeze([...pullRequests].sort(comparePullRequests)),
      validCheckpointKeys: Object.freeze([...validCheckpointKeys].sort()),
      resolvedRepositoryKeys: Object.freeze([...resolvedRepositoryKeys].sort()),
      failures: Object.freeze([...failures]),
      totalRepositories,
      completedRepositories,
      isComplete: completedRepositories === totalRepositories,
    });

  const loadOne = async (repository: RepositoryRef) => {
    const result = await Effect.runPromise(
      Effect.either(provider.listOpenPullRequests(repository)),
    );
    resolvedRepositoryKeys.add(repositoryKey(repository));
    if (result._tag === "Left") {
      failures.push({ repository, errorTag: result.left._tag });
    } else {
      pullRequests.push(...result.right);
      const currentUserId = options.currentUserId;
      if (currentUserId) {
        for (const pullRequest of result.right) {
          if (options.signal?.aborted) break;
          const checkpoint = checkpoints.get(pullRequestKey(pullRequest));
          if (!checkpoint) continue;
          const signals = await scheduleActivityRead(() =>
            Effect.runPromise(Effect.either(provider.getReviewSignals(pullRequest.ref))),
          );
          if (signals === undefined || options.signal?.aborted) break;
          if (
            signals._tag === "Right" &&
            isCheckpointValid(pullRequest, signals.right, checkpoint, currentUserId)
          ) {
            validCheckpointKeys.add(checkpoint.pullRequestKey);
          }
        }
      }
    }
    completedRepositories += 1;
    if (!options.signal?.aborted) {
      options.onSnapshot?.(snapshot());
    }
  };

  const workerCount = Math.min(options.concurrency ?? 4, repositories.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!options.signal?.aborted) {
        const index = nextIndex++;
        if (index >= repositories.length) return;
        await loadOne(repositories[index]);
      }
    }),
  );

  return snapshot();
};

export const loadInbox = (
  provider: CodeReviewProvider,
  repositories: ReadonlyArray<RepositoryRef>,
  options: LoadInboxOptions = {},
): Effect.Effect<InboxLoadSnapshot, never> =>
  Effect.promise(() => runLoad(provider, repositories, options));

export const inboxHasConfirmedEmptyResult = (snapshot: InboxLoadSnapshot): boolean =>
  snapshot.isComplete && snapshot.failures.length === 0 && snapshot.pullRequests.length === 0;

export const shouldAppearInInbox = (
  pullRequest: PullRequestSummary,
  signals: ReadonlyArray<ReviewSignal>,
  checkpoint: Checkpoint | undefined,
  currentUserId: string,
): boolean =>
  checkpoint === undefined || !isCheckpointValid(pullRequest, signals, checkpoint, currentUserId);
