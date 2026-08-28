import { Effect } from "effect";
import type { BitbucketCredentials } from "./auth";
import { buildBitbucketRequest } from "./request";
import {
  diagnosticCapabilities,
  type DiagnosticCapability,
  type DiagnosticsReport,
} from "../../connection/model";
import type { ProviderError } from "../errors";

type FetchImplementation = (request: Request) => Promise<Response>;

export interface DiagnosticsOptions {
  readonly fetch?: FetchImplementation;
  readonly signal?: AbortSignal;
}

const endpointTemplates = {
  identity: "/user",
  "workspace-visibility": "/workspaces",
  "repository-visibility": "/repositories",
  "open-pr-list": "/repositories/{workspace}/{repository}/pullrequests",
  activity: "/repositories/{workspace}/{repository}/pullrequests/{pullRequestId}/activity",
  comments: "/repositories/{workspace}/{repository}/pullrequests/{pullRequestId}/comments",
  diffstat: "/repositories/{workspace}/{repository}/pullrequests/{pullRequestId}/diffstat",
  diff: "/repositories/{workspace}/{repository}/pullrequests/{pullRequestId}/diff",
} as const satisfies Record<DiagnosticCapability, string>;

const networkError = (operation: string, endpoint: string): ProviderError => ({
  _tag: "NetworkError",
  message: "Provider could not be reached",
  operation,
  endpoint,
});

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

const decodeError = (operation: string, endpoint: string): ProviderError => ({
  _tag: "DecodeError",
  message: "Provider returned invalid data",
  operation,
  endpoint,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const firstPageValues = (
  value: unknown,
  operation: string,
  endpoint: string,
): ReadonlyArray<unknown> => {
  if (!isRecord(value) || !Array.isArray(value.values)) throw decodeError(operation, endpoint);
  return value.values;
};

const firstString = (value: unknown, keys: ReadonlyArray<string>): string | undefined => {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key] !== "") return value[key];
  }
  return undefined;
};

const firstNumber = (value: unknown, keys: ReadonlyArray<string>): number | undefined => {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    if (typeof value[key] === "number" && Number.isInteger(value[key])) return value[key];
  }
  return undefined;
};

const requestJson = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal?: AbortSignal,
): Effect.Effect<unknown, ProviderError> =>
  Effect.gen(function* () {
    if (signal?.aborted) return yield* Effect.fail(networkError(operation, endpoint));

    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(buildBitbucketRequest(path, credentials, { signal })),
      catch: () => networkError(operation, endpoint),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        httpError(response.status, operation, endpoint, response.headers.get("Retry-After")),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => decodeError(operation, endpoint),
    });
  });

const requestText = (
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal?: AbortSignal,
): Effect.Effect<string, ProviderError> =>
  Effect.gen(function* () {
    if (signal?.aborted) return yield* Effect.fail(networkError(operation, endpoint));

    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(buildBitbucketRequest(path, credentials, { signal })),
      catch: () => networkError(operation, endpoint),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        httpError(response.status, operation, endpoint, response.headers.get("Retry-After")),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => decodeError(operation, endpoint),
    });
  });

const runProbe = <A>(
  capability: DiagnosticCapability,
  path: string,
  operation: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal: AbortSignal | undefined,
  decode: (body: unknown) => A,
): Effect.Effect<A, ProviderError> =>
  requestJson(
    path,
    operation,
    endpointTemplates[capability],
    credentials,
    fetchImplementation,
    signal,
  ).pipe(
    Effect.flatMap((body) =>
      Effect.try({
        try: () => decode(body),
        catch: () => decodeError(operation, endpointTemplates[capability]),
      }),
    ),
  );

const runTextProbe = (
  capability: DiagnosticCapability,
  path: string,
  operation: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  signal: AbortSignal | undefined,
): Effect.Effect<string, ProviderError> =>
  requestText(
    path,
    operation,
    endpointTemplates[capability],
    credentials,
    fetchImplementation,
    signal,
  );

const listValues = (capability: DiagnosticCapability, operation: string) => (body: unknown) =>
  firstPageValues(body, operation, endpointTemplates[capability]);

const repositoryPath = (workspace: string, repository: string): string =>
  `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;

const firstWorkspace = (body: unknown): string => {
  const value = firstPageValues(
    body,
    "workspace visibility",
    endpointTemplates["workspace-visibility"],
  )[0];
  const slug = firstString(value, ["slug", "username", "name"]);
  if (!slug) throw new Error("workspace is unavailable");
  return slug;
};

const firstRepository = (body: unknown): { workspace: string; repository: string } => {
  const value = firstPageValues(
    body,
    "repository visibility",
    endpointTemplates["repository-visibility"],
  )[0];
  if (!isRecord(value)) throw new Error("repository is unavailable");
  const repository = firstString(value, ["slug", "name"]);
  const workspaceValue = isRecord(value.workspace) ? value.workspace : undefined;
  const workspace = firstString(workspaceValue, ["slug", "username", "name"]);
  if (!repository || !workspace) throw new Error("repository is unavailable");
  return { workspace, repository };
};

const firstPullRequest = (body: unknown): number => {
  const value = firstPageValues(
    body,
    "open pull request list",
    endpointTemplates["open-pr-list"],
  )[0];
  const id = firstNumber(value, ["id"]);
  if (id === undefined) throw new Error("pull request is unavailable");
  return id;
};

const successResults = (): Record<
  DiagnosticCapability,
  { capability: DiagnosticCapability; status: "succeeded" }
> =>
  Object.fromEntries(
    diagnosticCapabilities.map((capability) => [capability, { capability, status: "succeeded" }]),
  ) as Record<DiagnosticCapability, { capability: DiagnosticCapability; status: "succeeded" }>;

/** Execute one bounded, sequential, read-only probe for each Phase 0 capability. */
export const runBitbucketDiagnostics = (
  credentials: BitbucketCredentials,
  options: DiagnosticsOptions = {},
): Effect.Effect<DiagnosticsReport, ProviderError> => {
  const fetchImplementation = options.fetch ?? ((request: Request) => fetch(request));
  const signal = options.signal;

  return Effect.gen(function* () {
    yield* runProbe(
      "identity",
      "/user",
      "identity",
      credentials,
      fetchImplementation,
      signal,
      (body) => {
        if (!isRecord(body) || typeof body.uuid !== "string")
          throw new Error("identity unavailable");
        return true;
      },
    );
    const workspace = yield* runProbe(
      "workspace-visibility",
      "/workspaces?pagelen=1",
      "workspace visibility",
      credentials,
      fetchImplementation,
      signal,
      firstWorkspace,
    );
    const repository = yield* runProbe(
      "repository-visibility",
      "/repositories?role=member&pagelen=1",
      "repository visibility",
      credentials,
      fetchImplementation,
      signal,
      firstRepository,
    );
    const selectedWorkspace = repository.workspace || workspace;
    const repositoryBase = repositoryPath(selectedWorkspace, repository.repository);
    const pullRequest = yield* runProbe(
      "open-pr-list",
      `${repositoryBase}/pullrequests?state=OPEN&pagelen=1`,
      "open pull request list",
      credentials,
      fetchImplementation,
      signal,
      (body) => firstPullRequest(body),
    );
    const pullRequestBase = `${repositoryBase}/pullrequests/${pullRequest}`;

    yield* runProbe(
      "activity",
      `${pullRequestBase}/activity?pagelen=1`,
      "activity",
      credentials,
      fetchImplementation,
      signal,
      listValues("activity", "activity"),
    );
    yield* runProbe(
      "comments",
      `${pullRequestBase}/comments?pagelen=1`,
      "comments",
      credentials,
      fetchImplementation,
      signal,
      listValues("comments", "comments"),
    );
    yield* runProbe(
      "diffstat",
      `${pullRequestBase}/diffstat?pagelen=1`,
      "diffstat",
      credentials,
      fetchImplementation,
      signal,
      listValues("diffstat", "diffstat"),
    );
    yield* runTextProbe(
      "diff",
      `${pullRequestBase}/diff`,
      "diff",
      credentials,
      fetchImplementation,
      signal,
    );

    return { state: "succeeded", capabilities: successResults() } satisfies DiagnosticsReport;
  });
};

export interface BitbucketMutationRequestShape {
  readonly method: "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
}

export interface BitbucketPullRequestMutationRef {
  readonly workspace: string;
  readonly repository: string;
  readonly pullRequestId: number;
}

const mutationPath = (ref: BitbucketPullRequestMutationRef): string =>
  `${repositoryPath(ref.workspace, ref.repository)}/pullrequests/${ref.pullRequestId}`;

export const buildApproveRequestShape = (
  ref: BitbucketPullRequestMutationRef,
): BitbucketMutationRequestShape => ({
  method: "POST",
  path: `${mutationPath(ref)}/approve`,
  body: undefined,
});

export const buildRequestChangesRequestShape = (
  ref: BitbucketPullRequestMutationRef,
): BitbucketMutationRequestShape => ({
  method: "POST",
  path: `${mutationPath(ref)}/request-changes`,
  body: undefined,
});

export const buildGeneralCommentRequestShape = (
  ref: BitbucketPullRequestMutationRef,
  text: string,
): BitbucketMutationRequestShape => ({
  method: "POST",
  path: `${mutationPath(ref)}/comments`,
  body: { content: { raw: text } },
});

export const buildInlineCommentRequestShape = (
  ref: BitbucketPullRequestMutationRef,
  text: string,
  anchor: { readonly path: string; readonly line: number; readonly side: "new" | "old" },
): BitbucketMutationRequestShape => ({
  method: "POST",
  path: `${mutationPath(ref)}/comments`,
  body: {
    content: { raw: text },
    inline:
      anchor.side === "old"
        ? { path: anchor.path, from: anchor.line }
        : { path: anchor.path, to: anchor.line },
  },
});
