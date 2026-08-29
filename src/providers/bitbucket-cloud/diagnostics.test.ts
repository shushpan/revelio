import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { BitbucketCredentials } from "./auth";
import {
  buildApproveRequestShape,
  buildGeneralCommentRequestShape,
  buildInlineCommentRequestShape,
  buildRequestChangesRequestShape,
  runBitbucketDiagnostics,
} from "./diagnostics";

const credentials = {
  provider: "bitbucket-cloud",
  payload: { email: "reviewer@example.test", apiToken: "synthetic-token" },
} satisfies BitbucketCredentials;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const diagnosticFixtures = {
  user: { uuid: "{user-uuid}", display_name: "Synthetic Reviewer" },
  workspaces: { values: [{ uuid: "{workspace-uuid}", slug: "acme" }] },
  repositories: { values: [{ uuid: "{repo-uuid}", slug: "review", workspace: { slug: "acme" } }] },
  pullRequests: { values: [{ id: 7 }] },
  activity: { values: [{ date: "2026-08-28T09:30:00Z" }] },
  comments: { values: [] },
  diffstat: { values: [] },
  diff: "diff --git a/README.md b/README.md\n",
};

const successfulFetcher = vi.fn(async (request: Request) => {
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;
  if (path === "/2.0/user") return response(diagnosticFixtures.user);
  if (path === "/2.0/user/workspaces?pagelen=1") return response(diagnosticFixtures.workspaces);
  if (path === "/2.0/repositories/acme?pagelen=1") return response(diagnosticFixtures.repositories);
  if (path === "/2.0/repositories/acme/review/pullrequests?state=OPEN&pagelen=1")
    return response(diagnosticFixtures.pullRequests);
  if (path === "/2.0/repositories/acme/review/pullrequests/7/activity?pagelen=1")
    return response(diagnosticFixtures.activity);
  if (path === "/2.0/repositories/acme/review/pullrequests/7/comments?pagelen=1")
    return response(diagnosticFixtures.comments);
  if (path === "/2.0/repositories/acme/review/pullrequests/7/diffstat?pagelen=1")
    return response(diagnosticFixtures.diffstat);
  if (path === "/2.0/repositories/acme/review/pullrequests/7/diff")
    return response(diagnosticFixtures.diff);
  throw new Error(`unexpected fixture path: ${path}`);
});

describe("Bitbucket diagnostics workflow", () => {
  it("runs full opaque discovery, retains partial results, and probes only the first normalized repository", async () => {
    const workspaceNext = "https://api.bitbucket.org/2.0/user/workspaces?cursor=workspace-opaque";
    const repositoryNext =
      "https://api.bitbucket.org/2.0/repositories/acme?cursor=repository-opaque";
    const paths: string[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      paths.push(path);
      if (path === "/2.0/user") return response(diagnosticFixtures.user);
      if (path === "/2.0/user/workspaces?pagelen=1")
        return response({ values: [{ slug: "zeta" }], next: workspaceNext });
      if (path === new URL(workspaceNext).pathname + new URL(workspaceNext).search)
        return response({ values: [{ slug: "acme" }] });
      if (path === "/2.0/repositories/acme?pagelen=1")
        return response({ values: [{ slug: "z-repo" }], next: repositoryNext });
      if (path === new URL(repositoryNext).pathname + new URL(repositoryNext).search)
        return response({ values: [{ slug: "a-repo" }] });
      if (path === "/2.0/repositories/zeta?pagelen=1") return response({ secret: "partial" }, 403);
      if (path === "/2.0/repositories/acme/a-repo/pullrequests?state=OPEN&pagelen=1")
        return response(diagnosticFixtures.pullRequests);
      if (path.endsWith("/activity?pagelen=1")) return response(diagnosticFixtures.activity);
      if (path.endsWith("/comments?pagelen=1")) return response(diagnosticFixtures.comments);
      if (path.endsWith("/diffstat?pagelen=1")) return response(diagnosticFixtures.diffstat);
      if (path.endsWith("/diff")) return response(diagnosticFixtures.diff);
      throw new Error(`unexpected fixture path: ${path}`);
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(result.state).toBe("failed");
    expect(result.capabilities["workspace-visibility"]).toEqual({
      capability: "workspace-visibility",
      status: "succeeded",
    });
    expect(result.capabilities["repository-visibility"]).toEqual({
      capability: "repository-visibility",
      status: "failed",
      errorTag: "PartialDiscovery",
    });
    expect(result.capabilities["open-pr-list"].status).toBe("succeeded");
    expect(paths).toEqual([
      "/2.0/user",
      "/2.0/user/workspaces?pagelen=1",
      new URL(workspaceNext).pathname + new URL(workspaceNext).search,
      "/2.0/repositories/acme?pagelen=1",
      new URL(repositoryNext).pathname + new URL(repositoryNext).search,
      "/2.0/repositories/zeta?pagelen=1",
      "/2.0/repositories/acme/a-repo/pullrequests?state=OPEN&pagelen=1",
      "/2.0/repositories/acme/a-repo/pullrequests/7/activity?pagelen=1",
      "/2.0/repositories/acme/a-repo/pullrequests/7/comments?pagelen=1",
      "/2.0/repositories/acme/a-repo/pullrequests/7/diffstat?pagelen=1",
      "/2.0/repositories/acme/a-repo/pullrequests/7/diff",
    ]);
    expect(JSON.stringify(result)).not.toContain("partial");
    expect(JSON.stringify(result)).not.toContain("opaque");
  });

  it("runs the eight read probes sequentially and returns only redacted capability results", async () => {
    const active = { value: 0, maximum: 0 };
    const fetcher = vi.fn(async (request: Request) => {
      active.value += 1;
      active.maximum = Math.max(active.maximum, active.value);
      await Promise.resolve();
      const result = await successfulFetcher(request);
      active.value -= 1;
      return result;
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(active.maximum).toBe(1);
    expect(Object.keys(result.capabilities)).toEqual([
      "identity",
      "workspace-visibility",
      "repository-visibility",
      "open-pr-list",
      "activity",
      "comments",
      "diffstat",
      "diff",
    ]);
    expect(Object.values(result.capabilities).every((entry) => entry.status === "succeeded")).toBe(
      true,
    );
    expect(
      fetcher.mock.calls.map(([request]) => {
        const url = new URL(request.url);
        return `${url.pathname}${url.search}`;
      }),
    ).toEqual([
      "/2.0/user",
      "/2.0/user/workspaces?pagelen=1",
      "/2.0/repositories/acme?pagelen=1",
      "/2.0/repositories/acme/review/pullrequests?state=OPEN&pagelen=1",
      "/2.0/repositories/acme/review/pullrequests/7/activity?pagelen=1",
      "/2.0/repositories/acme/review/pullrequests/7/comments?pagelen=1",
      "/2.0/repositories/acme/review/pullrequests/7/diffstat?pagelen=1",
      "/2.0/repositories/acme/review/pullrequests/7/diff",
    ]);
    expect(JSON.stringify(result)).not.toContain("Synthetic");
    expect(JSON.stringify(result)).not.toContain("acme");
    expect(JSON.stringify(result)).not.toContain("reviewer@example.test");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    expect(JSON.stringify(result)).not.toContain("diff --git");
  });

  it("aborts between bounded sequential probes without leaking a request body or header", async () => {
    const controller = new AbortController();
    let requestCount = 0;
    const fetcher = vi.fn(async (request: Request) => {
      requestCount += 1;
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.get("Authorization")).toContain("Basic");
      if (requestCount === 1) controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher, signal: controller.signal }),
    );
    expect(result.capabilities.identity).toMatchObject({
      status: "failed",
      errorTag: "NetworkError",
    });
    expect(requestCount).toBe(1);
  });

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
    [429, "RateLimited"],
  ] as const)("maps HTTP %i to the distinct %s error", async (status, errorTag) => {
    const fetcher = vi.fn(async () => response({ secret: "body" }, status));
    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    expect(result.capabilities.identity.errorTag).toBe(errorTag);
  });

  it("maps network/CORS and invalid JSON separately", async () => {
    const network = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, {
        fetch: vi.fn(async () => Promise.reject(new Error("CORS secret"))),
      }),
    );
    expect(network.capabilities.identity.errorTag).toBe("NetworkError");

    const decode = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, {
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }),
    );
    expect(decode.capabilities.identity.errorTag).toBe("DecodeError");
  });

  it("preserves an auth failure and continues independent probes", async () => {
    const requestedPaths: string[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      requestedPaths.push(path);
      if (path === "/2.0/user") return response({ secret: "invalid" }, 401);
      return successfulFetcher(request);
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );
    expect(requestedPaths.slice(0, 4)).toEqual([
      "/2.0/user",
      "/2.0/user/workspaces",
      "/2.0/repositories/acme",
      "/2.0/repositories/acme/review/pullrequests",
    ]);
    expect(result.state).toBe("failed");
    expect(result.capabilities.identity).toEqual({
      capability: "identity",
      status: "failed",
      errorTag: "Unauthorized",
    });
    expect(result.capabilities["workspace-visibility"]).toMatchObject({ status: "succeeded" });
  });

  it("marks dependent probes unavailable when no repository or pull request identifier exists", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/2.0/user") return response(diagnosticFixtures.user);
      if (path === "/2.0/user/workspaces") return response({ values: [] });
      throw new Error(`unexpected dependent request: ${path}`);
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );
    expect(result.state).toBe("failed");
    expect(result.capabilities["workspace-visibility"]).toEqual({
      capability: "workspace-visibility",
      status: "unavailable",
      errorTag: "Unavailable",
    });
    expect(result.capabilities["repository-visibility"]).toEqual({
      capability: "repository-visibility",
      status: "unavailable",
      errorTag: "Unavailable",
    });
    expect(result.capabilities["open-pr-list"]).toEqual({
      capability: "open-pr-list",
      status: "unavailable",
      errorTag: "Unavailable",
    });
    expect(result.capabilities.activity.status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects workspace discovery entries without a slug", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/2.0/user") return response(diagnosticFixtures.user);
      if (path === "/2.0/user/workspaces") return response({ values: [{ username: "acme" }] });
      throw new Error(`unexpected dependent request: ${path}`);
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(result.capabilities["workspace-visibility"]).toEqual({
      capability: "workspace-visibility",
      status: "failed",
      errorTag: "DecodeError",
    });
    expect(result.capabilities["repository-visibility"].status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects repository discovery entries without a slug", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/2.0/user") return response(diagnosticFixtures.user);
      if (path === "/2.0/user/workspaces") return response(diagnosticFixtures.workspaces);
      if (path === "/2.0/repositories/acme") return response({ values: [{ name: "review" }] });
      throw new Error(`unexpected dependent request: ${path}`);
    });

    const result = await Effect.runPromise(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(result.capabilities["repository-visibility"]).toEqual({
      capability: "repository-visibility",
      status: "failed",
      errorTag: "DecodeError",
    });
    expect(result.capabilities["open-pr-list"].status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("percent-encodes a workspace slug before repository discovery", async () => {
    const requestedPaths: string[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      requestedPaths.push(path);
      if (path === "/2.0/user") return response(diagnosticFixtures.user);
      if (path === "/2.0/user/workspaces?pagelen=1")
        return response({ values: [{ slug: "acme cloud" }] });
      if (path === "/2.0/repositories/acme%20cloud?pagelen=1")
        return response({ values: [{ slug: "review" }] });
      if (path === "/2.0/repositories/acme%20cloud/review/pullrequests?state=OPEN&pagelen=1")
        return response(diagnosticFixtures.pullRequests);
      if (path.endsWith("/activity?pagelen=1")) return response(diagnosticFixtures.activity);
      if (path.endsWith("/comments?pagelen=1")) return response(diagnosticFixtures.comments);
      if (path.endsWith("/diffstat?pagelen=1")) return response(diagnosticFixtures.diffstat);
      if (path.endsWith("/diff")) return response(diagnosticFixtures.diff);
      throw new Error(`unexpected fixture path: ${path}`);
    });

    await Effect.runPromise(runBitbucketDiagnostics(credentials, { fetch: fetcher }));

    expect(requestedPaths.slice(0, 4)).toEqual([
      "/2.0/user",
      "/2.0/user/workspaces?pagelen=1",
      "/2.0/repositories/acme%20cloud?pagelen=1",
      "/2.0/repositories/acme%20cloud/review/pullrequests?state=OPEN&pagelen=1",
    ]);
  });
});

describe("Bitbucket mutation request-shape descriptors", () => {
  const ref = { workspace: "acme", repository: "review", pullRequestId: 7 } as const;

  it("describes approve and request-changes without credentials or execution", () => {
    expect(buildApproveRequestShape(ref)).toEqual({
      method: "POST",
      path: "/repositories/acme/review/pullrequests/7/approve",
      body: undefined,
    });
    expect(buildRequestChangesRequestShape(ref)).toEqual({
      method: "POST",
      path: "/repositories/acme/review/pullrequests/7/request-changes",
      body: undefined,
    });
  });

  it("describes general and inline comments with stable JSON payloads", () => {
    expect(buildGeneralCommentRequestShape(ref, "Synthetic comment")).toEqual({
      method: "POST",
      path: "/repositories/acme/review/pullrequests/7/comments",
      body: { content: { raw: "Synthetic comment" } },
    });
    expect(
      buildInlineCommentRequestShape(ref, "Synthetic inline", {
        path: "src/a.ts",
        line: 3,
        side: "new",
      }),
    ).toEqual({
      method: "POST",
      path: "/repositories/acme/review/pullrequests/7/comments",
      body: {
        content: { raw: "Synthetic inline" },
        inline: { path: "src/a.ts", to: 3 },
      },
    });
  });
});
