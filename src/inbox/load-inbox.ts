import { Effect } from "effect";
import type { CodeReviewProvider, PullRequestSummary, RepositoryRef } from "../providers/contracts";
import type { ProviderError } from "../providers/errors";

export interface InboxLoadFailure {
  readonly repository?: RepositoryRef;
  readonly errorTag: ProviderError["_tag"];
}

export interface InboxLoadResult {
  readonly pullRequests: ReadonlyArray<PullRequestSummary>;
  readonly failures: ReadonlyArray<InboxLoadFailure>;
}

export const loadInbox = (
  provider: CodeReviewProvider,
): Effect.Effect<InboxLoadResult, ProviderError> =>
  Effect.gen(function* () {
    const discovery = yield* provider.discoverRepositories();
    const pullRequests: PullRequestSummary[] = [];
    const failures: InboxLoadFailure[] = [...discovery.failures];

    for (const repository of discovery.repositories) {
      const result = yield* Effect.either(provider.listOpenPullRequests(repository));
      if (result._tag === "Left") {
        failures.push({ repository, errorTag: result.left._tag });
      } else {
        pullRequests.push(...result.right);
      }
    }

    return { pullRequests, failures };
  });
