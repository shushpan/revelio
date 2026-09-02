import { Effect } from "effect";
import type { BitbucketCredentials } from "./auth";
import { makeBitbucketClient } from "./client";
import { buildBitbucketRequest } from "./request";
import {
  diagnosticCapabilities,
  type DiagnosticCapability,
  type DiagnosticsReport,
} from "../../connection/model";
import type { RepositoryRef } from "../contracts";
import type { ProviderError } from "../errors";
import { mapBitbucketHttpError } from "./http-error";

type FetchImplementation = (request: Request) => Promise<Response>;

export interface DiagnosticsOptions {
  readonly fetch?: FetchImplementation;
  readonly signal?: AbortSignal;
}

const endpointTemplates = {
  identity: "/user",
  "workspace-visibility": "/user/workspaces",
  "repository-visibility": "/repositories/{workspace}",
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

const firstNumber = (value: unknown, keys: ReadonlyArray<string>): number | undefined => {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    if (typeof value[key] === "number" && Number.isInteger(value[key])) return value[key];
  }
  return undefined;
};

type ResponseReader<A> = (response: Response) => Promise<A>;

const request = <A>(
  path: string,
  operation: string,
  endpoint: string,
  credentials: BitbucketCredentials,
  fetchImplementation: FetchImplementation,
  read: ResponseReader<A>,
  signal?: AbortSignal,
): Effect.Effect<A, ProviderError> =>
  Effect.gen(function* () {
    if (signal?.aborted) return yield* Effect.fail(networkError(operation, endpoint));

    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(buildBitbucketRequest(path, credentials, { signal })),
      catch: () => networkError(operation, endpoint),
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
      try: () => read(response),
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
  request(
    path,
    operation,
    endpointTemplates[capability],
    credentials,
    fetchImplementation,
    (response) => response.json() as Promise<unknown>,
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
  request(
    path,
    operation,
    endpointTemplates[capability],
    credentials,
    fetchImplementation,
    (response) => response.text(),
    signal,
  );

const listValues = (capability: DiagnosticCapability, operation: string) => (body: unknown) =>
  firstPageValues(body, operation, endpointTemplates[capability]);

const repositoryPath = (workspace: string, repository: string): string =>
  `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;

const firstPullRequest = (body: unknown): number | undefined => {
  const value = firstPageValues(
    body,
    "open pull request list",
    endpointTemplates["open-pr-list"],
  )[0];
  if (!value) return undefined;
  const id = firstNumber(value, ["id"]);
  if (id === undefined) throw new Error("pull request is unavailable");
  return id;
};

type ProbeOutcome<A> =
  | {
      readonly result: { readonly capability: DiagnosticCapability; readonly status: "succeeded" };
      readonly value: A;
    }
  | {
      readonly result: {
        readonly capability: DiagnosticCapability;
        readonly status: "failed";
        readonly errorTag: ProviderError["_tag"];
      };
    };

const unavailable = (capability: DiagnosticCapability) => ({
  capability,
  status: "unavailable" as const,
  errorTag: "Unavailable" as const,
});

const outcomeResult = <A>(
  outcome: ProbeOutcome<A>,
): DiagnosticsReport["capabilities"][DiagnosticCapability] =>
  outcome.result.status === "succeeded" && "value" in outcome && outcome.value === undefined
    ? unavailable(outcome.result.capability)
    : outcome.result;

const probe = <A>(effect: Effect.Effect<A, ProviderError>, capability: DiagnosticCapability) =>
  Effect.either(effect).pipe(
    Effect.map(
      (outcome): ProbeOutcome<A> =>
        outcome._tag === "Right"
          ? { result: { capability, status: "succeeded" }, value: outcome.right }
          : { result: { capability, status: "failed", errorTag: outcome.left._tag } },
    ),
  );

const reportFrom = (
  results: Readonly<
    Record<DiagnosticCapability, DiagnosticsReport["capabilities"][DiagnosticCapability]>
  >,
): DiagnosticsReport => ({
  state: diagnosticCapabilities.every((capability) => results[capability].status === "succeeded")
    ? "succeeded"
    : "failed",
  capabilities: results,
});

/** Execute bounded, sequential, read-only probes and preserve every capability outcome. */
export const runBitbucketDiagnostics = (
  credentials: BitbucketCredentials,
  options: DiagnosticsOptions = {},
): Effect.Effect<DiagnosticsReport, ProviderError> => {
  const fetchImplementation = options.fetch ?? ((request: Request) => fetch(request));
  const signal = options.signal;
  const client = makeBitbucketClient(credentials, fetchImplementation, { signal });

  return Effect.gen(function* () {
    const results = {} as Record<
      DiagnosticCapability,
      DiagnosticsReport["capabilities"][DiagnosticCapability]
    >;
    const identity = yield* probe(client.getCurrentUser, "identity");
    results.identity = outcomeResult(identity);

    const workspaceList = yield* probe(client.listWorkspaces(), "workspace-visibility");
    if (workspaceList.result.status === "failed" || !("value" in workspaceList)) {
      results["workspace-visibility"] = workspaceList.result;
      results["repository-visibility"] = unavailable("repository-visibility");
      results["open-pr-list"] = unavailable("open-pr-list");
      results.activity = unavailable("activity");
      results.comments = unavailable("comments");
      results.diffstat = unavailable("diffstat");
      results.diff = unavailable("diff");
      return reportFrom(results);
    }

    const workspaces = workspaceList.value;
    if (workspaces.length === 0) {
      results["workspace-visibility"] = unavailable("workspace-visibility");
      results["repository-visibility"] = unavailable("repository-visibility");
      results["open-pr-list"] = unavailable("open-pr-list");
      results.activity = unavailable("activity");
      results.comments = unavailable("comments");
      results.diffstat = unavailable("diffstat");
      results.diff = unavailable("diff");
      return reportFrom(results);
    }

    results["workspace-visibility"] = {
      capability: "workspace-visibility",
      status: "succeeded",
    };

    const repositories: RepositoryRef[] = [];
    const repositoryFailures: Array<ProviderError["_tag"]> = [];
    for (const workspace of workspaces) {
      const pageResult = yield* Effect.either(client.listRepositories(workspace));
      if (pageResult._tag === "Left") {
        repositoryFailures.push(pageResult.left._tag);
        continue;
      }
      repositories.push(...pageResult.right);
    }
    repositories.sort((left, right) =>
      `${left.workspace}/${left.slug}`.localeCompare(`${right.workspace}/${right.slug}`),
    );

    const selectedRepository = repositories[0];
    results["repository-visibility"] =
      repositoryFailures.length > 0
        ? {
            capability: "repository-visibility",
            status: "failed",
            errorTag: selectedRepository
              ? "PartialDiscovery"
              : (repositoryFailures[0] ?? "PartialDiscovery"),
          }
        : selectedRepository
          ? { capability: "repository-visibility", status: "succeeded" }
          : unavailable("repository-visibility");

    if (!selectedRepository) {
      results["open-pr-list"] = unavailable("open-pr-list");
      results.activity = unavailable("activity");
      results.comments = unavailable("comments");
      results.diffstat = unavailable("diffstat");
      results.diff = unavailable("diff");
      return reportFrom(results);
    }

    const repositoryBase = repositoryPath(selectedRepository.workspace, selectedRepository.slug);
    const pullRequest = yield* probe(
      runProbe(
        "open-pr-list",
        `${repositoryBase}/pullrequests?state=OPEN&pagelen=1`,
        "open pull request list",
        credentials,
        fetchImplementation,
        signal,
        (body) => firstPullRequest(body),
      ),
      "open-pr-list",
    );
    results["open-pr-list"] = outcomeResult(pullRequest);
    if (
      pullRequest.result.status !== "succeeded" ||
      !("value" in pullRequest) ||
      pullRequest.value === undefined
    ) {
      results.activity = unavailable("activity");
      results.comments = unavailable("comments");
      results.diffstat = unavailable("diffstat");
      results.diff = unavailable("diff");
      return reportFrom(results);
    }
    const pullRequestBase = `${repositoryBase}/pullrequests/${pullRequest.value}`;

    const activity = yield* probe(
      runProbe(
        "activity",
        `${pullRequestBase}/activity?pagelen=1`,
        "activity",
        credentials,
        fetchImplementation,
        signal,
        listValues("activity", "activity"),
      ),
      "activity",
    );
    results.activity = outcomeResult(activity);
    const comments = yield* probe(
      runProbe(
        "comments",
        `${pullRequestBase}/comments?pagelen=1`,
        "comments",
        credentials,
        fetchImplementation,
        signal,
        listValues("comments", "comments"),
      ),
      "comments",
    );
    results.comments = outcomeResult(comments);
    const diffstat = yield* probe(
      runProbe(
        "diffstat",
        `${pullRequestBase}/diffstat?pagelen=1`,
        "diffstat",
        credentials,
        fetchImplementation,
        signal,
        listValues("diffstat", "diffstat"),
      ),
      "diffstat",
    );
    results.diffstat = outcomeResult(diffstat);
    const diff = yield* probe(
      runTextProbe(
        "diff",
        `${pullRequestBase}/diff`,
        "diff",
        credentials,
        fetchImplementation,
        signal,
      ),
      "diff",
    );
    results.diff = outcomeResult(diff);

    return reportFrom(results);
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
