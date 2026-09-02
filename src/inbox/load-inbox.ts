import { Effect } from "effect";
import type {
  CodeReviewProvider,
  PullRequestSummary,
  RepositoryRef,
  ReviewSignal,
} from "../providers/contracts";
import type { ProviderError } from "../providers/errors";
import { type Checkpoint, isCheckpointValid } from "./checkpoint";

export interface InboxLoadFailure {
  readonly repository: RepositoryRef;
  readonly errorTag: ProviderError["_tag"];
}

export interface InboxLoadSnapshot {
  readonly pullRequests: ReadonlyArray<PullRequestSummary>;
  readonly failures: ReadonlyArray<InboxLoadFailure>;
  readonly totalRepositories: number;
  readonly completedRepositories: number;
  readonly isComplete: boolean;
}

export interface LoadInboxOptions {
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onSnapshot?: (snapshot: InboxLoadSnapshot) => void;
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

const runLoad = async (
  provider: CodeReviewProvider,
  repositories: ReadonlyArray<RepositoryRef>,
  options: LoadInboxOptions,
): Promise<InboxLoadSnapshot> => {
  const totalRepositories = repositories.length;
  const pullRequests: PullRequestSummary[] = [];
  const failures: InboxLoadFailure[] = [];
  let completedRepositories = 0;

  const snapshot = (): InboxLoadSnapshot =>
    Object.freeze({
      pullRequests: Object.freeze([...pullRequests].sort(comparePullRequests)),
      failures: Object.freeze([...failures]),
      totalRepositories,
      completedRepositories,
      isComplete: completedRepositories === totalRepositories,
    });

  const loadOne = async (repository: RepositoryRef) => {
    const result = await Effect.runPromise(
      Effect.either(provider.listOpenPullRequests(repository)),
    );
    if (result._tag === "Left") {
      failures.push({ repository, errorTag: result.left._tag });
    } else {
      pullRequests.push(...result.right);
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
