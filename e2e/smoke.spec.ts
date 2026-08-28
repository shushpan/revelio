import { expect, test } from "./fixtures";

test("renders the Fast Review shell without browser console errors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Fast Review" })).toBeVisible();
  await expect(page.getByText("Phase 0 readiness")).toBeVisible();
});
