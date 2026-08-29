import { expect, test } from "./fixtures";
import type { Page, Route } from "@playwright/test";

const syntheticCredentials = {
  email: "reviewer@example.test",
  token: "synthetic-token",
};

const assertReadOnlyRequest = (route: Route): URL => {
  const request = route.request();
  expect(request.method()).toBe("GET");
  const url = new URL(request.url());
  expect(url.origin).toBe("https://api.bitbucket.org");
  expect(url.pathname.startsWith("/2.0/")).toBe(true);
  expect(request.headers().authorization).toBe(
    `Basic ${Buffer.from(`${syntheticCredentials.email}:${syntheticCredentials.token}`).toString("base64")}`,
  );
  return url;
};

const installReadOnlyBitbucketFixtures = async (
  page: Page,
): Promise<() => ReadonlyArray<string>> => {
  const expectedPaths = [
    "/2.0/user",
    "/2.0/user/workspaces?pagelen=1",
    "/2.0/repositories/acme?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests?state=OPEN&pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/activity?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/comments?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/diffstat?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/diff",
  ];
  const observedPaths: string[] = [];
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    const url = assertReadOnlyRequest(route);
    const path = url.pathname;
    const fullPath = `${url.pathname}${url.search}`;
    expect(expectedPaths).toContain(fullPath);
    observedPaths.push(fullPath);
    if (path === "/2.0/user") {
      await route.fulfill({ json: { uuid: "{user-uuid}", display_name: "Synthetic Reviewer" } });
      return;
    }
    if (path === "/2.0/user/workspaces") {
      await route.fulfill({ json: { values: [{ uuid: "{workspace-uuid}", slug: "acme" }] } });
      return;
    }
    if (path === "/2.0/repositories/acme") {
      await route.fulfill({
        json: { values: [{ uuid: "{repo-uuid}", slug: "review", workspace: { slug: "acme" } }] },
      });
      return;
    }
    if (path.endsWith("/pullrequests")) {
      await route.fulfill({ json: { values: [{ id: 7 }] } });
      return;
    }
    if (path.endsWith("/diff")) {
      await route.fulfill({ json: "diff --git a/README.md b/README.md\n" });
      return;
    }
    if (path.endsWith("/activity") || path.endsWith("/comments") || path.endsWith("/diffstat")) {
      await route.fulfill({ json: { values: [] } });
      return;
    }
    throw new Error(`unexpected Bitbucket probe path: ${fullPath}`);
  });
  return () => observedPaths;
};

const fillCredentials = async (page: Page): Promise<void> => {
  await page.getByLabel("Atlassian email").fill(syntheticCredentials.email);
  await page.getByLabel("Bitbucket API token").fill(syntheticCredentials.token);
};

test("runs all read-only probes with synthetic intercepted responses", async ({ page }) => {
  const observedPaths = await installReadOnlyBitbucketFixtures(page);
  await page.goto("/");
  await fillCredentials(page);
  await page.getByRole("button", { name: "Run diagnostics" }).click();

  await expect(page.getByRole("heading", { name: "Diagnostics succeeded" })).toBeVisible();
  await expect(page.getByText("Identity").locator("..").getByText("succeeded")).toBeVisible();
  await expect(
    page
      .locator("li")
      .filter({ has: page.getByText("Diff", { exact: true }) })
      .getByText("succeeded"),
  ).toBeVisible();
  expect(observedPaths()).toEqual([
    "/2.0/user",
    "/2.0/user/workspaces?pagelen=1",
    "/2.0/repositories/acme?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests?state=OPEN&pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/activity?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/comments?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/diffstat?pagelen=1",
    "/2.0/repositories/acme/review/pullrequests/7/diff",
  ]);
  await expect(page.locator("body")).not.toContainText("acme");
  await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
});

test.describe("invalid-token diagnostics", () => {
  test.use({ expectedApiErrorStatuses: [401] });

  test("reports an invalid-token failure without exposing response data", async ({ page }) => {
    const observedPaths: string[] = [];
    await page.route("https://api.bitbucket.org/**", async (route: Route) => {
      const url = assertReadOnlyRequest(route);
      const fullPath = `${url.pathname}${url.search}`;
      expect([
        "/2.0/user",
        "/2.0/workspaces?pagelen=1",
        "/2.0/repositories?role=member&pagelen=1",
      ]).toContain(fullPath);
      observedPaths.push(fullPath);
      await route.fulfill({ status: 401, json: { secret: "synthetic response body" } });
    });
    await page.goto("/");
    await fillCredentials(page);
    await page.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics failed" })).toBeVisible();
    await expect(
      page.locator(".result-failed").filter({ hasText: "Unauthorized" }).first(),
    ).toBeVisible();
    expect(observedPaths).toEqual([
      "/2.0/user",
      "/2.0/workspaces?pagelen=1",
      "/2.0/repositories?role=member&pagelen=1",
    ]);
    await expect(page.locator("body")).not.toContainText("synthetic response body");
    await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
  });
});

test.describe("missing-scope diagnostics", () => {
  test.use({ expectedApiErrorStatuses: [403] });

  test("reports a missing-scope failure without exposing response data", async ({ page }) => {
    const observedPaths: string[] = [];
    await page.route("https://api.bitbucket.org/**", async (route: Route) => {
      const url = assertReadOnlyRequest(route);
      const path = url.pathname;
      observedPaths.push(`${url.pathname}${url.search}`);
      if (path === "/2.0/user") {
        await route.fulfill({ json: { uuid: "{user-uuid}", display_name: "Synthetic Reviewer" } });
        return;
      }
      if (path === "/2.0/user/workspaces" || path === "/2.0/repositories/acme") {
        await route.fulfill({ status: 403, json: { secret: "synthetic response body" } });
        return;
      }
      throw new Error(`unexpected Bitbucket probe path: ${path}`);
    });
    await page.goto("/");
    await fillCredentials(page);
    await page.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics failed" })).toBeVisible();
    await expect(
      page.locator(".result-failed").filter({ hasText: "Forbidden" }).first(),
    ).toBeVisible();
    expect(observedPaths).toEqual([
      "/2.0/user",
      "/2.0/user/workspaces?pagelen=1",
      "/2.0/repositories/acme?pagelen=1",
    ]);
    await expect(page.locator("body")).not.toContainText("synthetic response body");
    await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
  });
});

test.describe("retired-endpoint diagnostics", () => {
  test.use({ expectedApiErrorStatuses: [410] });

  test("labels an HTTP 410 without exposing the response body", async ({ page }) => {
    await page.route("https://api.bitbucket.org/**", async (route: Route) => {
      assertReadOnlyRequest(route);
      await route.fulfill({ status: 410, json: { secret: "retired response body" } });
    });
    await page.goto("/");
    await fillCredentials(page);
    await page.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics failed" })).toBeVisible();
    await expect(
      page
        .locator(".result-failed")
        .filter({ hasText: "Provider endpoint no longer available" })
        .first(),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("retired response body");
  });
});

test("Lock cancels a pending probe and reload clears credentials", async ({ page }) => {
  let releaseUser: (() => void) | undefined;
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    if (assertReadOnlyRequest(route).pathname === "/2.0/user") {
      await new Promise<void>((resolve) => {
        releaseUser = resolve;
      });
      await route.fulfill({ json: { uuid: "{user-uuid}" } });
      return;
    }
    throw new Error(
      `unexpected Bitbucket probe path during cancellation: ${route.request().url()}`,
    );
  });
  await page.goto("/");
  await fillCredentials(page);
  await page.getByRole("button", { name: "Run diagnostics" }).click();
  await expect(page.getByRole("button", { name: "Lock" })).toBeVisible();
  await page.getByRole("button", { name: "Lock" }).click();
  releaseUser?.();
  await expect(page.getByLabel("Atlassian email")).toHaveValue("");
  await expect(page.getByLabel("Bitbucket API token")).toHaveValue("");
  await expect(page.getByText("No diagnostics run yet.")).toBeVisible();

  await page.getByLabel("Atlassian email").fill(syntheticCredentials.email);
  await page.getByLabel("Bitbucket API token").fill(syntheticCredentials.token);
  await page.reload();
  await expect(page.getByLabel("Atlassian email")).toHaveValue("");
  await expect(page.getByLabel("Bitbucket API token")).toHaveValue("");
});
