import { expect, test } from "./fixtures";

test("renders the Revelio shell without browser console errors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Revelio" })).toBeVisible();
  await expect(page.getByText(/fast\s+review/i)).toHaveCount(0);
  await expect(page.getByText("Phase 0 readiness")).toBeVisible();
  await expect(page).toHaveTitle("Revelio");
});
