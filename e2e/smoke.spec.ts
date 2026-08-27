import { test, expect } from "@playwright/test";

test("renders the Fast Review shell without browser console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Fast Review" })).toBeVisible();
  await expect(page.getByText("Phase 0 readiness")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
