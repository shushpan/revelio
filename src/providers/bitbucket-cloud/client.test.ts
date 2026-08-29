import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import activityPage from "./__fixtures__/activity-page.json";
import pullRequestPage from "./__fixtures__/pull-request-page.json";
import user from "./__fixtures__/user.json";
import { makeBitbucketClient } from "./client";

const credentials = {
  provider: "bitbucket-cloud",
  payload: { email: "reviewer@example.test", apiToken: "synthetic-token" },
} satisfies import("./auth").BitbucketCredentials;

describe("Bitbucket read client", () => {
  it("normalizes identity, all pull-request pages, and review activity without mutation methods", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      requests.push(request);
      if (request.url.endsWith("/user")) return new Response(JSON.stringify(user), { status: 200 });
      if (request.url.includes("page=2")) {
        return new Response(JSON.stringify({ ...pullRequestPage, next: undefined, values: [] }), {
          status: 200,
        });
      }
      if (request.url.includes("/activity")) {
        return new Response(JSON.stringify(activityPage), { status: 200 });
      }
      return new Response(JSON.stringify(pullRequestPage), { status: 200 });
    });
    const client = makeBitbucketClient(credentials, fetcher);

    await expect(Effect.runPromise(client.getCurrentUser)).resolves.toEqual({
      id: "{user-uuid}",
      displayName: "Synthetic Reviewer",
      nickname: "reviewer",
    });
    await expect(
      Effect.runPromise(client.listOpenPullRequests({ workspace: "acme", slug: "review" })),
    ).resolves.toMatchObject([
      {
        ref: { repository: { workspace: "acme", slug: "review" }, id: 7 },
        state: "OPEN",
        sourceBranch: "feature/review-queue",
        targetBranch: "main",
      },
    ]);
    await expect(
      Effect.runPromise(
        client.getReviewSignals({ repository: { workspace: "acme", slug: "review" }, id: 7 }),
      ),
    ).resolves.toMatchObject([
      { id: "approval:2026-08-28T09:31:00+00:00:{reviewer-uuid}", kind: "approved" },
      { kind: "changes_requested" },
      { kind: "commented", text: "Synthetic review comment" },
      { kind: "updated" },
      { kind: "other" },
    ]);

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.bitbucket.org/2.0/user",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN&page=1",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?page=2",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/activity?page=1",
    ]);
    expect(requests.every((request) => request.cache === "no-store")).toBe(true);
    expect(client.capabilities.canWriteReviews).toBe(true);
  });

  it("fetches diffs and sends review actions with exact Bitbucket requests", async () => {
    const requests: Array<{ method: string; url: string; body: string | null }> = [];
    const fetcher = vi.fn(async (request: Request) => {
      requests.push({
        method: request.method,
        url: request.url,
        body: request.body === null ? null : await request.clone().text(),
      });
      if (request.url.endsWith("/diff"))
        return new Response("diff --git a/a.ts b/a.ts", { status: 200 });
      return new Response(null, { status: 204 });
    });
    const client = makeBitbucketClient(credentials, fetcher);
    const ref = { repository: { workspace: "acme", slug: "review" }, id: 7 } as const;

    await expect(Effect.runPromise(client.getPullRequestDiff(ref))).resolves.toBe(
      "diff --git a/a.ts b/a.ts",
    );
    await expect(Effect.runPromise(client.approvePullRequest(ref))).resolves.toBeUndefined();
    await expect(Effect.runPromise(client.requestChanges(ref))).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(client.addGeneralComment(ref, "Overall comment")),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        client.addInlineComment(ref, "Inline comment", {
          path: "src/a.ts",
          line: 3,
          side: "new",
        }),
      ),
    ).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        method: "GET",
        url: "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/diff",
        body: null,
      },
      {
        method: "POST",
        url: "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/approve",
        body: null,
      },
      {
        method: "POST",
        url: "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/request-changes",
        body: null,
      },
      {
        method: "POST",
        url: "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/comments",
        body: JSON.stringify({ content: { raw: "Overall comment" } }),
      },
      {
        method: "POST",
        url: "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/comments",
        body: JSON.stringify({
          content: { raw: "Inline comment" },
          inline: { path: "src/a.ts", to: 3 },
        }),
      },
    ]);
    expect(client.capabilities.canWriteReviews).toBe(true);
  });

  it("redacts response bodies from failed review actions", async () => {
    const fetcher = vi.fn(async () => new Response("secret-token=must-not-leak", { status: 500 }));
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(
      Effect.either(
        client.addGeneralComment(
          { repository: { workspace: "acme", slug: "review" }, id: 7 },
          "Overall comment",
        ),
      ),
    );

    expect(result._tag).toBe("Left");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
  });

  it("follows an opaque next link without reconstructing pagination query state", async () => {
    const requests: string[] = [];
    const opaqueNext =
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN&cursor=opaque%2Ftoken&page=7";
    const fetcher = vi.fn(async (request: Request) => {
      requests.push(request.url);
      if (request.url.includes("cursor=opaque%2Ftoken")) {
        return new Response(JSON.stringify({ ...pullRequestPage, values: [], next: undefined }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ ...pullRequestPage, values: [], next: opaqueNext }), {
        status: 200,
      });
    });
    const client = makeBitbucketClient(credentials, fetcher);

    await expect(
      Effect.runPromise(client.listOpenPullRequests({ workspace: "acme", slug: "review" })),
    ).resolves.toEqual([]);

    expect(requests).toEqual([
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN&page=1",
      opaqueNext,
    ]);
  });

  it("discovers every workspace and repository page in deterministic normalized order", async () => {
    const requests: string[] = [];
    const workspaceNext = "https://api.bitbucket.org/2.0/user/workspaces?cursor=workspace-opaque";
    const repoNext = "https://api.bitbucket.org/2.0/repositories/acme?cursor=repo-opaque";
    const fetcher = vi.fn(async (request: Request) => {
      requests.push(request.url);
      if (request.url.endsWith("/user/workspaces?pagelen=1"))
        return new Response(JSON.stringify({ values: [{ slug: "zeta" }], next: workspaceNext }), {
          status: 200,
        });
      if (request.url === workspaceNext)
        return new Response(JSON.stringify({ values: [{ slug: "acme" }] }), { status: 200 });
      if (request.url.endsWith("/repositories/acme?pagelen=1"))
        return new Response(JSON.stringify({ values: [{ slug: "z-repo" }], next: repoNext }), {
          status: 200,
        });
      if (request.url === repoNext)
        return new Response(JSON.stringify({ values: [{ slug: "a-repo" }] }), { status: 200 });
      if (request.url.endsWith("/repositories/zeta?pagelen=1"))
        return new Response(JSON.stringify({ values: [{ slug: "only-repo" }] }), { status: 200 });
      throw new Error(`unexpected request: ${request.url}`);
    });
    const client = makeBitbucketClient(credentials, fetcher);

    await expect(Effect.runPromise(client.discoverRepositories())).resolves.toEqual({
      workspaces: ["acme", "zeta"],
      repositories: [
        { workspace: "acme", slug: "a-repo" },
        { workspace: "acme", slug: "z-repo" },
        { workspace: "zeta", slug: "only-repo" },
      ],
      failures: [],
    });
    expect(requests).toEqual([
      "https://api.bitbucket.org/2.0/user/workspaces?pagelen=1",
      workspaceNext,
      "https://api.bitbucket.org/2.0/repositories/acme?pagelen=1",
      repoNext,
      "https://api.bitbucket.org/2.0/repositories/zeta?pagelen=1",
    ]);
  });

  it("retains successful repositories and redacts a failed workspace result", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/2.0/user/workspaces")
        return new Response(JSON.stringify({ values: [{ slug: "good" }, { slug: "bad" }] }), {
          status: 200,
        });
      if (url.pathname === "/2.0/repositories/good")
        return new Response(JSON.stringify({ values: [{ slug: "review" }] }), { status: 200 });
      if (url.pathname === "/2.0/repositories/bad")
        return new Response("secret body", { status: 403 });
      throw new Error(`unexpected request: ${request.url}`);
    });
    const client = makeBitbucketClient(credentials, fetcher);

    const result = await Effect.runPromise(client.discoverRepositories());
    expect(result.repositories).toEqual([{ workspace: "good", slug: "review" }]);
    expect(result.failures).toEqual([{ errorTag: "Forbidden" }]);
    expect(JSON.stringify(result)).not.toContain("secret body");
  });

  it.each([
    [
      "foreign origin",
      "https://evil.example/2.0/repositories/acme/review/pullrequests?cursor=opaque",
    ],
    [
      "non-API path",
      "https://api.bitbucket.org/v1/repositories/acme/review/pullrequests?cursor=opaque",
    ],
    [
      "wrong endpoint family",
      "https://api.bitbucket.org/2.0/repositories/acme/review/comments?cursor=opaque",
    ],
  ])("rejects a %s returned pagination link", async (_description, next) => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...pullRequestPage, values: [], next }), { status: 200 }),
    );
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(
      Effect.either(client.listOpenPullRequests({ workspace: "acme", slug: "review" })),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "PaginationError",
        message: "Provider pagination returned an unsafe next link",
        operation: "open pull requests",
      },
    });
    expect(JSON.stringify(result)).not.toContain("opaque");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails repeated and over-ceiling pagination instead of looping forever", async () => {
    const repeatedFetcher = vi.fn(
      async () => new Response(JSON.stringify(pullRequestPage), { status: 200 }),
    );
    const repeatedClient = makeBitbucketClient(credentials, repeatedFetcher);
    const repeated = await Effect.runPromise(
      Effect.either(repeatedClient.listOpenPullRequests({ workspace: "acme", slug: "review" })),
    );
    expect(repeated).toMatchObject({
      _tag: "Left",
      left: { _tag: "PaginationError", message: "Provider pagination repeated a page marker" },
    });

    let endlessPageNumber = 0;
    const endlessFetcher = vi.fn(async () => {
      endlessPageNumber += 1;
      return new Response(
        JSON.stringify({
          ...pullRequestPage,
          next: `https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?cursor=${endlessPageNumber}`,
        }),
        { status: 200 },
      );
    });
    const endlessClient = makeBitbucketClient(credentials, endlessFetcher);
    const endless = await Effect.runPromise(
      Effect.either(endlessClient.listOpenPullRequests({ workspace: "acme", slug: "review" })),
    );
    expect(endless).toMatchObject({
      _tag: "Left",
      left: { _tag: "PaginationError", message: "Provider pagination exceeded its safety limit" },
    });
    expect(endlessFetcher).toHaveBeenCalledTimes(100);
  });

  it("maps HTTP failures to redacted provider errors", async () => {
    const fetcher = vi.fn(async () => new Response("token=must-not-leak", { status: 401 }));
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(Effect.either(client.getCurrentUser));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "Unauthorized",
        message: "Provider rejected the credentials",
        operation: "current user",
        endpoint: "/user",
        status: 401,
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it.each(["http", "network", "decode"] as const)(
    "redacts concrete details from second-page %s failures",
    async (failure) => {
      const opaqueNext =
        "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?cursor=opaque-secret";
      let requestCount = 0;
      const fetcher = vi.fn(async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({ ...pullRequestPage, values: [], next: opaqueNext }),
            {
              status: 200,
            },
          );
        }
        if (failure === "http") return new Response("sensitive response", { status: 500 });
        if (failure === "network") throw new Error("sensitive network details");
        return new Response("not-json", { status: 200 });
      });
      const client = makeBitbucketClient(credentials, fetcher);
      const result = await Effect.runPromise(
        Effect.either(client.listOpenPullRequests({ workspace: "acme", slug: "review" })),
      );

      expect(result._tag).toBe("Left");
      expect(JSON.stringify(result)).not.toContain("opaque-secret");
      expect(JSON.stringify(result)).not.toContain("acme");
      expect(JSON.stringify(result)).not.toContain("review");
      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          endpoint: "/repositories/{workspace}/{repository}/pullrequests",
        },
      });
    },
  );

  it("redacts the pull-request id from second-page activity failures", async () => {
    const opaqueNext =
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/42/activity?cursor=opaque-secret";
    let requestCount = 0;
    const fetcher = vi.fn(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response(JSON.stringify({ ...activityPage, values: [], next: opaqueNext }), {
          status: 200,
        });
      }
      return new Response("sensitive response", { status: 500 });
    });
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(
      Effect.either(
        client.getReviewSignals({ repository: { workspace: "acme", slug: "review" }, id: 42 }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ServerError",
        endpoint: "/repositories/{workspace}/{repository}/pullrequests/{pull_request}/activity",
      },
    });
    expect(JSON.stringify(result)).not.toContain("opaque-secret");
    expect(JSON.stringify(result)).not.toContain("acme");
    expect(JSON.stringify(result)).not.toContain("/review/");
    expect(JSON.stringify(result)).not.toContain("42");
  });

  it("names the current-user operation when a successful response is not valid JSON", async () => {
    const fetcher = vi.fn(async () => new Response("not-json", { status: 200 }));
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(Effect.either(client.getCurrentUser));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "DecodeError",
        message: "Provider returned invalid data",
        operation: "current user",
        endpoint: "/user",
      },
    });
  });
});
