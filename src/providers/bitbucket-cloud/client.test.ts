import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import activityPage from "./__fixtures__/activity-page.json";
import pullRequestPage from "./__fixtures__/pull-request-page.json";
import user from "./__fixtures__/user.json";
import { makeBitbucketClient } from "./client";

const credentials = { email: "reviewer@example.test", token: "synthetic-token" };

describe("Bitbucket read client", () => {
  it("normalizes identity, all pull-request pages, and review activity without mutation methods", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      requests.push(request.url);
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
      { id: "{activity-approved}", kind: "approved" },
      { id: "18", kind: "commented", text: "Synthetic review comment" },
      { id: "{activity-unknown}", kind: "other" },
    ]);

    expect(requests).toEqual([
      "https://api.bitbucket.org/2.0/user",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN&page=1",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests?state=OPEN&page=2",
      "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/activity?page=1",
    ]);
    expect(client.capabilities.canWriteReviews).toBe(false);
  });

  it("maps HTTP failures to redacted provider errors", async () => {
    const fetcher = vi.fn(async () => new Response("token=must-not-leak", { status: 401 }));
    const client = makeBitbucketClient(credentials, fetcher);
    const result = await Effect.runPromise(Effect.either(client.getCurrentUser));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "Unauthorized",
        message: "Bitbucket rejected the credentials",
        endpoint: "/user",
        status: 401,
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });
});
