import { expect, test } from "./fixtures";

test("renders the Revelio shell without browser console errors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Revelio" })).toBeVisible();
  await expect(page.getByText(/fast\s+review/i)).toHaveCount(0);
  await expect(page.getByText("Phase 0 readiness")).toBeVisible();
  await expect(page).toHaveTitle("Revelio");
});

test("switches between dark and system themes", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "System" }).click();
  await expect(page.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
