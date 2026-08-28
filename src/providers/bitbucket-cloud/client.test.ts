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
    expect(client.capabilities.canWriteReviews).toBe(false);
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
