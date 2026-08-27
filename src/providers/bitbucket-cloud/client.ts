import { Effect } from "effect";
import type {
  CodeReviewProvider,
  PullRequestRef,
  PullRequestSummary,
  ProviderUser,
  RepositoryRef,
  ReviewSignal,
} from "../contracts";
import type { ProviderError } from "../errors";
import { decodeError } from "../errors";
import type { BitbucketCredentials } from "./auth";
import { buildBitbucketRequest } from "./request";
import { decodeActivityPage, decodePullRequestPage, decodeUser, mapPullRequest } from "./schemas";

type FetchImplementation = (request: Request) => Promise<Response>;

const httpError = (
  status: number,
  operation: string,
  endpoint: string,
  retryAfter: string | null,
): ProviderError => {
  if (status === 401) {
    return {
      _tag: "Unauthorized",
      message: "Provider rejected the credentials",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 403) {
    return {
      _tag: "Forbidden",
      message: "Provider denied the requested permission",
      operation,
      endpoint,
      status,
    };
  }
  if (status === 429) {
    const parsed = retryAfter === null ? undefined : Number.parseInt(retryAfter, 10);
    return {
      _tag: "RateLimited",
      message: "Provider rate limit was reached",
      operation,
      endpoint,
      status,
      ...(parsed !== undefined && Number.isFinite(parsed) ? { retryAfterSeconds: parsed } : {}),
    };
  }
  return {
    _tag: "ServerError",
    message: "Provider returned a server error",
    operation,
    endpoint,
    status,
  };
};

const requestJson = (
  path: string,
  operation: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
): Effect.Effect<unknown, ProviderError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(buildBitbucketRequest(path, credentials)),
      catch: () =>
        ({
          _tag: "NetworkError",
          message: "Provider could not be reached",
          operation,
          endpoint: path,
        }) as const,
    });

    if (!response.ok) {
      return yield* Effect.fail(
        httpError(response.status, operation, path, response.headers.get("Retry-After")),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => decodeError(operation, path),
    });
  });

const collectPages = <A>(
  operation: string,
  fetchPage: (
    page: number,
  ) => Effect.Effect<{ readonly values: ReadonlyArray<A>; readonly next?: string }, ProviderError>,
): Effect.Effect<ReadonlyArray<A>, ProviderError> =>
  Effect.gen(function* () {
    const values: A[] = [];
    const seenMarkers = new Set<string>();
    let page = 1;
    let hasNext = true;
    while (hasNext) {
      if (page > 100) {
        return yield* Effect.fail({
          _tag: "PaginationError",
          message: "Provider pagination exceeded its safety limit",
          operation,
        } as const);
      }
      const current = yield* fetchPage(page);
      values.push(...current.values);
      hasNext = current.next !== undefined;
      if (current.next !== undefined) {
        if (seenMarkers.has(current.next)) {
          return yield* Effect.fail({
            _tag: "PaginationError",
            message: "Provider pagination repeated a page marker",
            operation,
          } as const);
        }
        seenMarkers.add(current.next);
      }
      page += 1;
    }
    return values;
  });

const repositoryPath = (repository: RepositoryRef): string =>
  `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.slug)}`;

export const makeBitbucketClient = (
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation = (request) => fetch(request),
): CodeReviewProvider => {
  const getCurrentUser: Effect.Effect<ProviderUser, ProviderError> = requestJson(
    "/user",
    "current user",
    credentials,
    fetchImplementation,
  ).pipe(Effect.flatMap(decodeUser));

  const listOpenPullRequests = (
    repository: RepositoryRef,
  ): Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError> =>
    collectPages("open pull requests", (page) => {
      const path = `${repositoryPath(repository)}/pullrequests?state=OPEN&page=${page}`;
      return requestJson(path, "open pull requests", credentials, fetchImplementation).pipe(
        Effect.flatMap(decodePullRequestPage),
      );
    }).pipe(Effect.map((values) => values.map((value) => mapPullRequest(value, repository))));

  const getReviewSignals = (
    pullRequest: PullRequestRef,
  ): Effect.Effect<ReadonlyArray<ReviewSignal>, ProviderError> =>
    collectPages("review activity", (page) => {
      const path = `${repositoryPath(pullRequest.repository)}/pullrequests/${pullRequest.id}/activity?page=${page}`;
      return requestJson(path, "review activity", credentials, fetchImplementation).pipe(
        Effect.flatMap(decodeActivityPage),
      );
    });

  return {
    id: "bitbucket-cloud",
    capabilities: {
      canReadPullRequests: true,
      canReadReviewSignals: true,
      canWriteReviews: false,
    },
    getCurrentUser,
    listOpenPullRequests,
    getReviewSignals,
  };
};
