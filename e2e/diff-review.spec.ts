import { expect, test } from "@playwright/test";

test("renders the production diff-first review surface with real worker preprocessing", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?fixture=large");
  await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "src/large.ts", exact: true })).toBeVisible();
  await expect(page.locator("[data-virtualized='true']")).toBeVisible();
  await expect(page.locator("[data-virtualized='true']")).toContainText("generated01");

  await page.getByRole("button", { name: "Split" }).click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unified" }).click();
  await expect(page.getByRole("button", { name: "Unified" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Comment on src/large.ts line 1" }).click();
  await expect(page.locator(".inline-comment-status")).toContainText(
    "Local inline-comment intent: src/large.ts:1 (additions)",
  );
  expect(consoleErrors).toEqual([]);
});
