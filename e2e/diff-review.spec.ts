import { expect, test } from "./fixtures";

test("renders the production diff-first review surface with real worker preprocessing", async ({
  page,
}) => {
  await page.goto("/?fixture=large");
  await page.getByRole("button", { name: "Light" }).click();
  await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "src/large.ts", exact: true })).toBeVisible();
  await expect(page.getByText("6 files · 200 additions · 0 deletions")).toBeVisible();
  await expect(page.locator(".diff-view")).toContainText("generated01");
  await expect(page.locator(".diff-view")).not.toContainText("e28");

  await page.getByRole("button", { name: "src/medium-e.ts", exact: true }).click();
  await expect(page.locator(".diff-view")).toContainText("e28");

  await page.getByRole("button", { name: "Split" }).click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unified" }).click();
  await expect(page.getByRole("button", { name: "Unified" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Comment on src/medium-e.ts line 3" }).click();
  await expect(page.locator(".inline-comment-status")).toContainText(
    "Local inline-comment intent: src/medium-e.ts:3 (additions)",
  );
  expect(await page.locator(".diff-view").innerHTML()).not.toContain("github-light");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".diff-view")).toContainText("e28");
  await page.getByRole("button", { name: "src/large.ts", exact: true }).click();
  await expect(page.locator(".diff-view")).toContainText("generated01");
  expect(await page.locator(".diff-view").innerHTML()).not.toContain("github-light");
});

test("keeps the lazy diff bundle out of the normal root until opened", async ({ page }) => {
  const scriptRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scriptRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open diff demo" })).toBeVisible();
  const initialScriptCount = scriptRequests.length;
  await page.getByRole("button", { name: "Open diff demo" }).click();
  await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  expect(scriptRequests.length).toBeGreaterThan(initialScriptCount);
});
