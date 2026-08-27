import { Effect } from "effect";
import type {
  CodeReviewProvider,
  PullRequestRef,
  PullRequestSummary,
  ProviderCredentials,
  ProviderUser,
  RepositoryRef,
  ReviewSignal,
} from "../contracts";
import type { ProviderError } from "../errors";
import { decodeError } from "../errors";
import { buildBitbucketRequest } from "./request";
import { decodeActivityPage, decodePullRequestPage, decodeUser, mapPullRequest } from "./schemas";

type FetchImplementation = (request: Request) => Promise<Response>;

const httpError = (status: number, endpoint: string, retryAfter: string | null): ProviderError => {
  if (status === 401) {
    return {
      _tag: "Unauthorized",
      message: "Bitbucket rejected the credentials",
      endpoint,
      status,
    };
  }
  if (status === 403) {
    return {
      _tag: "Forbidden",
      message: "Bitbucket denied the requested permission",
      endpoint,
      status,
    };
  }
  if (status === 429) {
    const parsed = retryAfter === null ? undefined : Number.parseInt(retryAfter, 10);
    return {
      _tag: "RateLimited",
      message: "Bitbucket rate limit was reached",
      endpoint,
      status,
      ...(parsed !== undefined && Number.isFinite(parsed) ? { retryAfterSeconds: parsed } : {}),
    };
  }
  return {
    _tag: "ServerError",
    message: "Bitbucket returned a server error",
    endpoint,
    status,
  };
};

const requestJson = (
  path: string,
  credentials: ProviderCredentials,
  fetchImplementation: FetchImplementation,
): Effect.Effect<unknown, ProviderError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(buildBitbucketRequest(path, credentials)),
      catch: () =>
        ({
          _tag: "NetworkError",
          message: "Bitbucket could not be reached",
          endpoint: path,
        }) as const,
    });

    if (!response.ok) {
      return yield* Effect.fail(
        httpError(response.status, path, response.headers.get("Retry-After")),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => decodeError("Bitbucket returned an unreadable pull-request response", path),
    });
  });

const collectPages = <A>(
  fetchPage: (
    page: number,
  ) => Effect.Effect<{ readonly values: ReadonlyArray<A>; readonly next?: string }, ProviderError>,
): Effect.Effect<ReadonlyArray<A>, ProviderError> =>
  Effect.gen(function* () {
    const values: A[] = [];
    let page = 1;
    let hasNext = true;
    while (hasNext) {
      const current = yield* fetchPage(page);
      values.push(...current.values);
      hasNext = current.next !== undefined;
      page += 1;
    }
    return values;
  });

const repositoryPath = (repository: RepositoryRef): string =>
  `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.slug)}`;

export const makeBitbucketClient = (
  credentials: ProviderCredentials,
  fetchImplementation: FetchImplementation = (request) => fetch(request),
): CodeReviewProvider => {
  const getCurrentUser: Effect.Effect<ProviderUser, ProviderError> = requestJson(
    "/user",
    credentials,
    fetchImplementation,
  ).pipe(Effect.flatMap(decodeUser));

  const listOpenPullRequests = (
    repository: RepositoryRef,
  ): Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError> =>
    collectPages((page) => {
      const path = `${repositoryPath(repository)}/pullrequests?state=OPEN&page=${page}`;
      return requestJson(path, credentials, fetchImplementation).pipe(
        Effect.flatMap(decodePullRequestPage),
      );
    }).pipe(Effect.map((values) => values.map((value) => mapPullRequest(value, repository))));

  const getReviewSignals = (
    pullRequest: PullRequestRef,
  ): Effect.Effect<ReadonlyArray<ReviewSignal>, ProviderError> =>
    collectPages((page) => {
      const path = `${repositoryPath(pullRequest.repository)}/pullrequests/${pullRequest.id}/activity?page=${page}`;
      return requestJson(path, credentials, fetchImplementation).pipe(
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
