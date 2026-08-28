import { expect, test, type Page, type Route } from "@playwright/test";

const syntheticCredentials = {
  email: "reviewer@example.test",
  token: "synthetic-token",
};

const installReadOnlyBitbucketFixtures = async (page: Page): Promise<void> => {
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/2.0/user") {
      await route.fulfill({ json: { uuid: "{user-uuid}", display_name: "Synthetic Reviewer" } });
      return;
    }
    if (path === "/2.0/workspaces") {
      await route.fulfill({ json: { values: [{ uuid: "{workspace-uuid}", slug: "acme" }] } });
      return;
    }
    if (path === "/2.0/repositories") {
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
    await route.fulfill({ json: { values: [] } });
  });
};

const fillCredentials = async (page: Page): Promise<void> => {
  await page.getByLabel("Atlassian email").fill(syntheticCredentials.email);
  await page.getByLabel("Bitbucket API token").fill(syntheticCredentials.token);
};

test("runs all read-only probes with synthetic intercepted responses", async ({ page }) => {
  await installReadOnlyBitbucketFixtures(page);
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
  await expect(page.locator("body")).not.toContainText("acme");
  await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
});

test("reports an invalid-token failure without exposing response data", async ({ page }) => {
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    await route.fulfill({ status: 401, json: { secret: "synthetic response body" } });
  });
  await page.goto("/");
  await fillCredentials(page);
  await page.getByRole("button", { name: "Run diagnostics" }).click();
  await expect(page.getByRole("heading", { name: "Diagnostics failed" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("synthetic response body");
  await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
});

test("reports a missing-scope failure without exposing response data", async ({ page }) => {
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/2.0/user") {
      await route.fulfill({ json: { uuid: "{user-uuid}", display_name: "Synthetic Reviewer" } });
      return;
    }
    await route.fulfill({ status: 403, json: { secret: "synthetic response body" } });
  });
  await page.goto("/");
  await fillCredentials(page);
  await page.getByRole("button", { name: "Run diagnostics" }).click();
  await expect(page.getByRole("heading", { name: "Diagnostics failed" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("synthetic response body");
  await expect(page.locator("body")).not.toContainText(syntheticCredentials.token);
});

test("Lock cancels a pending probe and reload clears credentials", async ({ page }) => {
  let releaseUser: (() => void) | undefined;
  await page.route("https://api.bitbucket.org/**", async (route: Route) => {
    if (new URL(route.request().url()).pathname === "/2.0/user") {
      await new Promise<void>((resolve) => {
        releaseUser = resolve;
      });
      await route.fulfill({ json: { uuid: "{user-uuid}" } });
      return;
    }
    await route.fulfill({ json: { values: [] } });
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
