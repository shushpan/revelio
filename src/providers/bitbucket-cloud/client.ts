import { Effect } from "effect";
import type {
  CodeReviewProvider,
  PullRequestRef,
  PullRequestSummary,
  ProviderUser,
  RepositoryDiscoveryResult,
  RepositoryRef,
  ReviewSignal,
} from "../contracts";
import type { ProviderError } from "../errors";
import { decodeError } from "../errors";
import type { BitbucketCredentials } from "./auth";
import { mapBitbucketHttpError } from "./http-error";
import { buildBitbucketRequest, buildBitbucketRequestForUrl, BITBUCKET_API_BASE } from "./request";
import {
  decodeActivityPage,
  decodePullRequestPage,
  decodeRepositoryPage,
  decodeUser,
  decodeWorkspacePage,
  mapPullRequest,
} from "./schemas";

type FetchImplementation = (request: Request) => Promise<Response>;

export interface BitbucketClientOptions {
  readonly signal?: AbortSignal;
}

const requestJson = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal?: AbortSignal,
): Effect.Effect<unknown, ProviderError> =>
  Effect.gen(function* () {
    if (signal?.aborted) {
      return yield* Effect.fail({
        _tag: "NetworkError",
        message: "Provider could not be reached",
        operation,
        endpoint,
      } as const);
    }
    const response = yield* Effect.tryPromise({
      try: () =>
        fetchImplementation(
          path.startsWith("/")
            ? buildBitbucketRequest(path, credentials, { signal })
            : buildBitbucketRequestForUrl(path, credentials, { signal }),
        ),
      catch: () =>
        ({
          _tag: "NetworkError",
          message: "Provider could not be reached",
          operation,
          endpoint,
        }) as const,
    });

    if (!response.ok) {
      return yield* Effect.fail(
        mapBitbucketHttpError(
          response.status,
          operation,
          endpoint,
          response.headers.get("Retry-After"),
        ),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => decodeError(operation, endpoint),
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
  options: BitbucketClientOptions = {},
): CodeReviewProvider => {
  const getCurrentUser: Effect.Effect<ProviderUser, ProviderError> = requestJson(
    "/user",
    "current user",
    "/user",
    credentials,
    fetchImplementation,
    options.signal,
  ).pipe(Effect.flatMap(decodeUser));

  const discoverRepositories = (): Effect.Effect<RepositoryDiscoveryResult, ProviderError> =>
    Effect.gen(function* () {
      const workspaceSlugs = yield* collectPages(
        "workspace discovery",
        "/user/workspaces?pagelen=1",
        "/user/workspaces",
        (path) =>
          requestJson(
            path,
            "workspace discovery",
            "/user/workspaces",
            credentials,
            fetchImplementation,
            options.signal,
          ).pipe(Effect.flatMap(decodeWorkspacePage)),
      );
      const workspaces = [...workspaceSlugs].sort();
      const repositories: RepositoryRef[] = [];
      const failures: RepositoryDiscoveryResult["failures"][number][] = [];
      for (const workspace of workspaces) {
        const pageResult = yield* Effect.either(
          collectPages(
            "repository discovery",
            `/repositories/${encodeURIComponent(workspace)}?pagelen=1`,
            `/repositories/${encodeURIComponent(workspace)}`,
            (path) =>
              requestJson(
                path,
                "repository discovery",
                "/repositories/{workspace}",
                credentials,
                fetchImplementation,
                options.signal,
              ).pipe(Effect.flatMap(decodeRepositoryPage)),
          ),
        );
        if (pageResult._tag === "Left") {
          failures.push({ errorTag: pageResult.left._tag });
          continue;
        }
        repositories.push(...pageResult.right.map((slug) => ({ workspace, slug })));
      }
      repositories.sort((left, right) =>
        `${left.workspace}\u0000${left.slug}`.localeCompare(
          `${right.workspace}\u0000${right.slug}`,
        ),
      );
      return { workspaces, repositories, failures };
    });

  const listOpenPullRequests = (
    repository: RepositoryRef,
  ): Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError> =>
    collectPages(
      "open pull requests",
      `${repositoryPath(repository)}/pullrequests?state=OPEN&page=1`,
      `${repositoryPath(repository)}/pullrequests`,
      (path) => {
        return requestJson(
          path,
          "open pull requests",
          "/repositories/{workspace}/{repository}/pullrequests",
          credentials,
          fetchImplementation,
          options.signal,
        ).pipe(Effect.flatMap(decodePullRequestPage));
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
        return requestJson(
          path,
          "review activity",
          "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/activity",
          credentials,
          fetchImplementation,
          options.signal,
        ).pipe(Effect.flatMap(decodeActivityPage));
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
    discoverRepositories,
    listOpenPullRequests,
    getReviewSignals,
  };
};
