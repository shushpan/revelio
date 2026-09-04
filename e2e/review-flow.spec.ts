import { expect, test } from "./fixtures";
import type { Page, Route } from "@playwright/test";

const credentials = {
  email: "reviewer@example.test",
  token: "synthetic-token",
};

const pullRequest = (repository: string, id: number, title: string, reviewerIds: string[]) => ({
  id,
  title,
  description: `Synthetic ${repository} pull request.`,
  state: "OPEN",
  updated_on: "2026-08-28T09:30:00+00:00",
  author: {
    uuid: "{author-uuid}",
    display_name: "Synthetic Author",
    nickname: "author",
  },
  source: {
    branch: { name: `feature/${repository}` },
    commit: { hash: `${repository}-source-commit` },
  },
  destination: { branch: { name: "main" } },
  reviewers: reviewerIds.map((uuid) => ({
    uuid,
    display_name: uuid === "{reviewer-uuid}" ? "Synthetic Reviewer" : "Another Reviewer",
    nickname: uuid === "{reviewer-uuid}" ? "reviewer" : "another-reviewer",
  })),
});

const reviewPatch = [
  "diff --git a/src/check.ts b/src/check.ts",
  "index 7c1d2e1..beef123 100644",
  "--- a/src/check.ts",
  "+++ b/src/check.ts",
  "@@ -1 +1,2 @@",
  " const ok = true;",
  "+export const reviewed = true;",
  "",
].join("\n");

type ToolRepositoryResponse = "success" | "failure" | "deferred";

interface FixtureOptions {
  readonly tools?: ToolRepositoryResponse;
  readonly toolsRequestedByCurrentUser?: boolean;
}

interface FixtureController {
  readonly observedRequests: () => ReadonlyArray<string>;
  readonly freshReviewArrivedDuringFinishRefresh: () => boolean;
  readonly releaseTools: () => void;
}

const assertCredentials = (route: Route): URL => {
  const request = route.request();
  expect(request.headers().authorization).toBe(
    `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString("base64")}`,
  );
  const url = new URL(request.url());
  expect(url.origin).toBe("https://api.bitbucket.org");
  return url;
};

const readStoredCheckpoints = async (page: Page): Promise<unknown> =>
  page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("revelio", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction("settings", "readonly");
          const get = transaction
            .objectStore("settings")
            .get("checkpoints:bitbucket-cloud:%7Breviewer-uuid%7D");
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve(get.result);
        };
      }),
  );

const installBitbucketFixtures = async (
  page: Page,
  { tools = "success", toolsRequestedByCurrentUser = false }: FixtureOptions = {},
): Promise<FixtureController> => {
  const observed: string[] = [];
  let freshReviewArrivedDuringFinishRefresh = false;
  let releaseTools = (): void => undefined;
  let reviewPullRequestReads = 0;
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    const request = route.request();
    const url = assertCredentials(route);
    const path = `${url.pathname}${url.search}`;
    const search = url.searchParams;

    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-origin": "http://127.0.0.1:4173",
        },
      });
      return;
    }

    observed.push(`${request.method()} ${url.pathname}`);
    if (request.method() === "POST") {
      if (path === "/2.0/repositories/acme/review/pullrequests/7/comments") {
        expect(request.postDataJSON()).toEqual({ content: { raw: "Looks good" } });
        await route.fulfill({ status: 201, json: {} });
        return;
      }
      if (path === "/2.0/repositories/acme/review/pullrequests/7/approve") {
        await route.fulfill({ status: 200, json: {} });
        return;
      }
      throw new Error(`Unexpected Bitbucket mutation: ${path}`);
    }

    expect(request.method()).toBe("GET");
    if (path === "/2.0/user") {
      await route.fulfill({
        json: { uuid: "{reviewer-uuid}", display_name: "Synthetic Reviewer", nickname: "reviewer" },
      });
      return;
    }
    if (
      url.pathname === "/2.0/user/workspaces" &&
      search.get("pagelen") === "100" &&
      search.get("fields") === "next,values.workspace.slug"
    ) {
      await route.fulfill({ json: { values: [{ workspace: { slug: "acme" } }] } });
      return;
    }
    if (
      url.pathname === "/2.0/repositories/acme" &&
      search.get("pagelen") === "100" &&
      search.get("fields") === "next,values.slug"
    ) {
      await route.fulfill({ json: { values: [{ slug: "review" }, { slug: "tools" }] } });
      return;
    }
    if (
      url.pathname === "/2.0/repositories/acme/review/pullrequests" &&
      search.get("state") === "OPEN" &&
      search.get("pagelen") === "50"
    ) {
      reviewPullRequestReads += 1;
      const freshReviewIsAvailable = reviewPullRequestReads >= 3;
      if (reviewPullRequestReads === 3) freshReviewArrivedDuringFinishRefresh = true;
      await route.fulfill({
        json: {
          values: [
            pullRequest("review", 7, "Improve review queue", ["{reviewer-uuid}"]),
            ...(freshReviewIsAvailable
              ? [pullRequest("review", 9, "Fresh review arrives", ["{reviewer-uuid}"])]
              : []),
          ],
        },
      });
      return;
    }
    if (
      url.pathname === "/2.0/repositories/acme/tools/pullrequests" &&
      search.get("state") === "OPEN" &&
      search.get("pagelen") === "50"
    ) {
      if (tools === "failure") {
        await route.fulfill({ json: { values: [{}] } });
        return;
      }
      if (tools === "deferred") {
        await new Promise<void>((resolve) => {
          releaseTools = resolve;
        });
      }
      await route.fulfill({
        json: {
          values: [
            pullRequest(
              "tools",
              8,
              "Tighten build checks",
              toolsRequestedByCurrentUser ? ["{reviewer-uuid}"] : ["{other-uuid}"],
            ),
          ],
        },
      });
      return;
    }
    if (path === "/2.0/repositories/acme/review/pullrequests/7/activity?page=1") {
      await route.fulfill({ json: { values: [] } });
      return;
    }
    if (
      path === "/2.0/repositories/acme/review/pullrequests/7/diff" ||
      path === "/2.0/repositories/acme/tools/pullrequests/8/diff"
    ) {
      await route.fulfill({ body: reviewPatch, contentType: "text/plain" });
      return;
    }
    throw new Error(`Unexpected Bitbucket request: ${request.method()} ${path}`);
  });
  return {
    observedRequests: () => observed,
    freshReviewArrivedDuringFinishRefresh: () => freshReviewArrivedDuringFinishRefresh,
    releaseTools: () => releaseTools(),
  };
};

test("connects to a cross-repository inbox, opens a real diff, and sends a general comment", async ({
  page,
}) => {
  const fixtures = await installBitbucketFixtures(page);
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();

  await expect(page.getByRole("heading", { name: "Open pull requests" })).toBeVisible();
  await expect(page.getByText("acme/review")).toBeVisible();
  await expect(page.getByText("acme/tools")).toHaveCount(0);
  await page.getByLabel("Filter pull requests").fill("");
  await expect(page.getByText("acme/review")).toBeVisible();
  await expect(page.getByText("acme/tools")).toBeVisible();

  await page.getByRole("button", { name: /acme\/review/ }).click();
  await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  await expect(page.locator(".diff-view")).toContainText("export const reviewed = true;");

  await page.getByRole("textbox", { name: "General comment" }).fill("Looks good");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.locator(".review-notice")).toHaveText("Comment sent.");
  expect(fixtures.observedRequests()).toEqual([
    "GET /2.0/user",
    "GET /2.0/user/workspaces",
    "GET /2.0/repositories/acme",
    "GET /2.0/repositories/acme/review/pullrequests",
    "GET /2.0/repositories/acme/tools/pullrequests",
    "GET /2.0/repositories/acme/review/pullrequests/7/diff",
    "POST /2.0/repositories/acme/review/pullrequests/7/comments",
  ]);
  await expect(page.locator("body")).not.toContainText(credentials.token);
});

test("Finish Review persists the review checkpoint before advancing the captured queue", async ({
  page,
}) => {
  const fixtures = await installBitbucketFixtures(page, { toolsRequestedByCurrentUser: true });
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();

  await expect(page.getByText("acme/review")).toBeVisible();
  await page.getByLabel("Filter pull requests").fill("");
  await page.getByRole("button", { name: /acme\/review/ }).click();
  await page.getByRole("button", { name: "Finish Review" }).click();
  const approvalRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url() ===
        "https://api.bitbucket.org/2.0/repositories/acme/review/pullrequests/7/approve",
  );
  await page.getByRole("button", { name: "Approve" }).click();
  const approval = await approvalRequest;
  expect(approval.postData()).toBeNull();

  await expect(page.getByRole("heading", { name: "Tighten build checks" })).toBeVisible();
  expect(fixtures.freshReviewArrivedDuringFinishRefresh()).toBe(true);
  await expect(page.getByRole("button", { name: "Queue (2)" })).toBeVisible();
  await page.getByRole("button", { name: "Queue (2)" }).click();
  const reviewQueue = page.getByRole("dialog", { name: "Review queue" });
  await expect(reviewQueue).toBeVisible();
  await expect(reviewQueue.getByRole("button", { name: /Improve review queue/ })).toBeVisible();
  await expect(
    reviewQueue.getByRole("button", { name: /Improve review queue/ }),
  ).not.toHaveAttribute("aria-current", "true");
  await expect(reviewQueue.getByRole("button", { name: /Tighten build checks/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(reviewQueue.getByRole("button", { name: /Fresh review arrives/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Close review queue" }).click();
  await expect
    .poll(() => readStoredCheckpoints(page))
    .toMatchObject({
      version: 1,
      checkpoints: [
        {
          pullRequestKey: "acme/review#7",
          reviewedHeadCommit: "review-source-commit",
          outcome: "approved",
        },
      ],
    });

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: /Fresh review arrives/ })).toBeVisible();
});

test("shows a successful row while another selected repository is still loading", async ({
  page,
}) => {
  const fixtures = await installBitbucketFixtures(page, { tools: "deferred" });
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();

  await expect(page.getByText("acme/review")).toBeVisible();
  await expect(page.locator(".inbox-copy[role=status]")).toContainText(
    "Loaded 1 of 2 repositories",
  );
  fixtures.releaseTools();
  await expect(page.locator(".inbox-copy[role=status]")).toContainText(
    "Loaded 2 of 2 repositories",
  );
});

test("keeps successful rows visible when another selected repository fails", async ({ page }) => {
  await installBitbucketFixtures(page, { tools: "failure" });
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();

  await expect(page.getByText("acme/review")).toBeVisible();
  await expect(
    page.getByText("Results are incomplete: 1 repositories could not be loaded."),
  ).toBeVisible();
  await expect(page.getByText("No pull requests in this view.")).toHaveCount(0);
});

test("reports unsupported queries without presenting an empty inbox", async ({ page }) => {
  await installBitbucketFixtures(page);
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();

  await expect(page.getByText("acme/review")).toBeVisible();
  await page.getByLabel("Filter pull requests").fill("ci:failed");
  await expect(page.locator(".inbox-warning[role=status]")).toContainText(
    "Unsupported filter: ci:failed.",
  );
  await expect(page.getByText("acme/review")).toBeVisible();
  await expect(page.getByText("No pull requests in this view.")).toHaveCount(0);
});

test("clears a session-only connection on reload and Lock", async ({ page }) => {
  await installBitbucketFixtures(page);
  await page.goto("/");
  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "acme", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This session only" }).click();
  await expect(page.getByRole("heading", { name: "Open pull requests" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Connect to Bitbucket Cloud" })).toBeVisible();

  await page.getByLabel("Atlassian email").fill(credentials.email);
  await page.getByLabel("Bitbucket API token").fill(credentials.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("button", { name: "This session only" }).click();
  await expect(page.getByRole("heading", { name: "Open pull requests" })).toBeVisible();
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByRole("heading", { name: "Connect to Bitbucket Cloud" })).toBeVisible();
});
