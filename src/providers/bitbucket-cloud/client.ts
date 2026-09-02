import { Effect } from "effect";
import type {
  CodeReviewProvider,
  InlineCommentAnchor,
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
import {
  buildBitbucketMutationRequest,
  buildBitbucketRequest,
  buildBitbucketRequestForUrl,
  BITBUCKET_API_BASE,
} from "./request";
import {
  decodeActivityPage,
  decodePullRequestPage,
  decodeRepositoryPage,
  decodeUser,
  decodeWorkspacePage,
  mapPullRequest,
} from "./schemas";

type FetchImplementation = (request: Request) => Promise<Response>;
type RequestBuilder = (
  path: string,
  credentials: BitbucketCredentials,
  options: { readonly signal?: AbortSignal },
) => Request;

export interface BitbucketClientOptions {
  readonly signal?: AbortSignal;
}

const requestResponse = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  buildRequest: RequestBuilder,
  signal?: AbortSignal,
): Effect.Effect<Response, ProviderError> =>
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
      try: () => fetchImplementation(buildRequest(path, credentials, { signal })),
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

    return response;
  });

const requestJson = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal?: AbortSignal,
): Effect.Effect<unknown, ProviderError> =>
  requestResponse(
    path,
    operation,
    endpoint,
    credentials,
    fetchImplementation,
    path.startsWith("/") ? buildBitbucketRequest : buildBitbucketRequestForUrl,
    signal,
  ).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: () => decodeError(operation, endpoint),
      }),
    ),
  );

const requestText = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal?: AbortSignal,
): Effect.Effect<string, ProviderError> =>
  requestResponse(
    path,
    operation,
    endpoint,
    credentials,
    fetchImplementation,
    (requestPath, requestCredentials, requestOptions) => {
      const request = buildBitbucketRequest(requestPath, requestCredentials, requestOptions);
      request.headers.set("Accept", "text/plain");
      return request;
    },
    signal,
  ).pipe(
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: () => response.text(),
        catch: () => decodeError(operation, endpoint),
      }),
    ),
  );

const requestMutation = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  body: unknown,
  signal?: AbortSignal,
): Effect.Effect<void, ProviderError> =>
  requestResponse(
    path,
    operation,
    endpoint,
    credentials,
    fetchImplementation,
    (requestPath, requestCredentials, options) =>
      buildBitbucketMutationRequest(requestPath, requestCredentials, body, options),
    signal,
  ).pipe(Effect.asVoid);

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

const pullRequestPath = (pullRequest: PullRequestRef): string =>
  `${repositoryPath(pullRequest.repository)}/pullrequests/${encodeURIComponent(String(pullRequest.id))}`;

const workspaceFields = "next,values.workspace.slug";
const repositoryFields = "next,values.slug";
const pullRequestFields = [
  "next",
  "values.id",
  "values.title",
  "values.description",
  "values.state",
  "values.updated_on",
  "values.author.uuid",
  "values.author.display_name",
  "values.author.nickname",
  "values.source.branch.name",
  "values.source.commit.hash",
  "values.destination.branch.name",
  "values.reviewers.uuid",
].join(",");

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
        `/user/workspaces?pagelen=100&fields=${encodeURIComponent(workspaceFields)}`,
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
            `/repositories/${encodeURIComponent(workspace)}?pagelen=100&fields=${encodeURIComponent(repositoryFields)}`,
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

  const listWorkspaces = (): Effect.Effect<ReadonlyArray<string>, ProviderError> =>
    collectPages(
      "workspace discovery",
      `/user/workspaces?pagelen=100&fields=${encodeURIComponent(workspaceFields)}`,
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
    ).pipe(Effect.map((slugs) => [...slugs].sort()));

  const listRepositories = (
    workspace: string,
  ): Effect.Effect<ReadonlyArray<RepositoryRef>, ProviderError> =>
    collectPages(
      "repository discovery",
      `/repositories/${encodeURIComponent(workspace)}?pagelen=100&fields=${encodeURIComponent(repositoryFields)}`,
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
    ).pipe(Effect.map((slugs) => [...slugs].sort().map((slug) => ({ workspace, slug }))));

  const listOpenPullRequests = (
    repository: RepositoryRef,
  ): Effect.Effect<ReadonlyArray<PullRequestSummary>, ProviderError> =>
    collectPages(
      "open pull requests",
      `${repositoryPath(repository)}/pullrequests?state=OPEN&pagelen=50&fields=${encodeURIComponent(pullRequestFields)}`,
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

  const getPullRequestDiff = (pullRequest: PullRequestRef): Effect.Effect<string, ProviderError> =>
    requestText(
      `${pullRequestPath(pullRequest)}/diff`,
      "pull request diff",
      "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/diff",
      credentials,
      fetchImplementation,
      options.signal,
    );

  const approvePullRequest = (pullRequest: PullRequestRef): Effect.Effect<void, ProviderError> =>
    requestMutation(
      `${pullRequestPath(pullRequest)}/approve`,
      "approve pull request",
      "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/approve",
      credentials,
      fetchImplementation,
      undefined,
      options.signal,
    );

  const requestChanges = (pullRequest: PullRequestRef): Effect.Effect<void, ProviderError> =>
    requestMutation(
      `${pullRequestPath(pullRequest)}/request-changes`,
      "request changes",
      "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/request-changes",
      credentials,
      fetchImplementation,
      undefined,
      options.signal,
    );

  const addGeneralComment = (
    pullRequest: PullRequestRef,
    text: string,
  ): Effect.Effect<void, ProviderError> =>
    requestMutation(
      `${pullRequestPath(pullRequest)}/comments`,
      "general comment",
      "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/comments",
      credentials,
      fetchImplementation,
      { content: { raw: text } },
      options.signal,
    );

  const addInlineComment = (
    pullRequest: PullRequestRef,
    text: string,
    anchor: InlineCommentAnchor,
  ): Effect.Effect<void, ProviderError> =>
    requestMutation(
      `${pullRequestPath(pullRequest)}/comments`,
      "inline comment",
      "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/comments",
      credentials,
      fetchImplementation,
      {
        content: { raw: text },
        inline:
          anchor.side === "old"
            ? { path: anchor.path, from: anchor.line }
            : { path: anchor.path, to: anchor.line },
      },
      options.signal,
    );

  return {
    id: "bitbucket-cloud",
    capabilities: {
      canReadPullRequests: true,
      canReadReviewSignals: true,
      canWriteReviews: true,
    },
    getCurrentUser,
    discoverRepositories,
    listWorkspaces,
    listRepositories,
    listOpenPullRequests,
    getReviewSignals,
    getPullRequestDiff,
    approvePullRequest,
    requestChanges,
    addGeneralComment,
    addInlineComment,
  };
};
