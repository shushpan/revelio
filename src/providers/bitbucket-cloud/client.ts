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
import { buildBitbucketRequest, buildBitbucketRequestForUrl, BITBUCKET_API_BASE } from "./request";
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
      try: () =>
        fetchImplementation(
          path.startsWith("/")
            ? buildBitbucketRequest(path, credentials)
            : buildBitbucketRequestForUrl(path, credentials),
        ),
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

type PageResult<A> = {
  readonly values: ReadonlyArray<A>;
  readonly next?: string;
};

const collectPages = <A>(
  operation: string,
  initialPath: string,
  endpointPath: string,
  fetchPage: (path: string) => Effect.Effect<PageResult<A>, ProviderError>,
): Effect.Effect<ReadonlyArray<A>, ProviderError> =>
  Effect.gen(function* () {
    const values: A[] = [];
    const seenMarkers = new Set<string>();
    const apiUrl = new URL(BITBUCKET_API_BASE);
    let path: string | undefined = initialPath;
    let pageCount = 0;
    while (path !== undefined) {
      if (pageCount >= 100) {
        return yield* Effect.fail({
          _tag: "PaginationError",
          message: "Provider pagination exceeded its safety limit",
          operation,
        } as const);
      }
      const current: PageResult<A> = yield* fetchPage(path);
      pageCount += 1;
      values.push(...current.values);
      if (current.next === undefined) {
        path = undefined;
        continue;
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(current.next);
      } catch {
        return yield* Effect.fail({
          _tag: "PaginationError",
          message: "Provider pagination returned an unsafe next link",
          operation,
        } as const);
      }
      if (
        current.next.trim() !== current.next ||
        nextUrl.origin !== apiUrl.origin ||
        nextUrl.username !== "" ||
        nextUrl.password !== "" ||
        nextUrl.pathname !== `${apiUrl.pathname}${endpointPath}` ||
        nextUrl.hash !== ""
      ) {
        return yield* Effect.fail({
          _tag: "PaginationError",
          message: "Provider pagination returned an unsafe next link",
          operation,
        } as const);
      }
      const marker = nextUrl.href;
      if (seenMarkers.has(marker)) {
        return yield* Effect.fail({
          _tag: "PaginationError",
          message: "Provider pagination repeated a page marker",
          operation,
        } as const);
      }
      seenMarkers.add(marker);
      path = current.next;
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
    collectPages(
      "open pull requests",
      `${repositoryPath(repository)}/pullrequests?state=OPEN&page=1`,
      `${repositoryPath(repository)}/pullrequests`,
      (path) => {
        return requestJson(path, "open pull requests", credentials, fetchImplementation).pipe(
          Effect.flatMap(decodePullRequestPage),
        );
      },
    ).pipe(Effect.map((values) => values.map((value) => mapPullRequest(value, repository))));

  const getReviewSignals = (
    pullRequest: PullRequestRef,
  ): Effect.Effect<ReadonlyArray<ReviewSignal>, ProviderError> =>
    collectPages(
      "review activity",
      `${repositoryPath(pullRequest.repository)}/pullrequests/${pullRequest.id}/activity?page=1`,
      `${repositoryPath(pullRequest.repository)}/pullrequests/${pullRequest.id}/activity`,
      (path) => {
        return requestJson(path, "review activity", credentials, fetchImplementation).pipe(
          Effect.flatMap(decodeActivityPage),
        );
      },
    );

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
