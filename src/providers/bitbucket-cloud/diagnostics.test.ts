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
  const path = new URL(request.url).pathname;
  if (path === "/2.0/user") return response(diagnosticFixtures.user);
  if (path === "/2.0/workspaces") return response(diagnosticFixtures.workspaces);
  if (path === "/2.0/repositories") return response(diagnosticFixtures.repositories);
  if (path.endsWith("/pullrequests")) return response(diagnosticFixtures.pullRequests);
  if (path.endsWith("/activity")) return response(diagnosticFixtures.activity);
  if (path.endsWith("/comments")) return response(diagnosticFixtures.comments);
  if (path.endsWith("/diffstat")) return response(diagnosticFixtures.diffstat);
  if (path.endsWith("/diff")) return response(diagnosticFixtures.diff);
  throw new Error(`unexpected fixture path: ${path}`);
});

describe("Bitbucket diagnostics workflow", () => {
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

    const result = await Effect.runPromiseExit(
      runBitbucketDiagnostics(credentials, { fetch: fetcher, signal: controller.signal }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(String(result.cause)).toContain("NetworkError");
    expect(requestCount).toBe(1);
  });

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
    [429, "RateLimited"],
  ] as const)("maps HTTP %i to the distinct %s error", async (status, errorTag) => {
    const fetcher = vi.fn(async () => response({ secret: "body" }, status));
    const result = await Effect.runPromiseExit(
      runBitbucketDiagnostics(credentials, { fetch: fetcher }),
    );

    expect(result._tag).toBe("Failure");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    if (result._tag === "Failure") expect(String(result.cause)).toContain(errorTag);
  });

  it("maps network/CORS and invalid JSON separately", async () => {
    const network = await Effect.runPromiseExit(
      runBitbucketDiagnostics(credentials, {
        fetch: vi.fn(async () => Promise.reject(new Error("CORS secret"))),
      }),
    );
    expect(network._tag).toBe("Failure");
    if (network._tag === "Failure") expect(String(network.cause)).toContain("NetworkError");

    const decode = await Effect.runPromiseExit(
      runBitbucketDiagnostics(credentials, {
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }),
    );
    expect(decode._tag).toBe("Failure");
    if (decode._tag === "Failure") expect(String(decode.cause)).toContain("DecodeError");
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
