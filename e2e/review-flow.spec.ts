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

const assertCredentials = (route: Route): URL => {
  const request = route.request();
  expect(request.headers().authorization).toBe(
    `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString("base64")}`,
  );
  const url = new URL(request.url());
  expect(url.origin).toBe("https://api.bitbucket.org");
  return url;
};

const installBitbucketFixtures = async (page: Page): Promise<() => ReadonlyArray<string>> => {
  const observed: string[] = [];
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
      expect(path).toBe("/2.0/repositories/acme/review/pullrequests/7/comments");
      expect(request.postDataJSON()).toEqual({ content: { raw: "Looks good" } });
      await route.fulfill({ status: 201, json: {} });
      return;
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
      await route.fulfill({
        json: { values: [pullRequest("review", 7, "Improve review queue", ["{reviewer-uuid}"])] },
      });
      return;
    }
    if (
      url.pathname === "/2.0/repositories/acme/tools/pullrequests" &&
      search.get("state") === "OPEN" &&
      search.get("pagelen") === "50"
    ) {
      await route.fulfill({
        json: { values: [pullRequest("tools", 8, "Tighten build checks", ["{other-uuid}"])] },
      });
      return;
    }
    if (path === "/2.0/repositories/acme/review/pullrequests/7/diff") {
      await route.fulfill({ body: reviewPatch, contentType: "text/plain" });
      return;
    }
    throw new Error(`Unexpected Bitbucket request: ${request.method()} ${path}`);
  });
  return () => observed;
};

test("connects to a cross-repository inbox, opens a real diff, and sends a general comment", async ({
  page,
}) => {
  const observedRequests = await installBitbucketFixtures(page);
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
  expect(observedRequests()).toEqual([
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
