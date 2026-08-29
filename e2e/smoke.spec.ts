import { expect, test } from "./fixtures";

test("renders the usable connection shell without diagnostics or overlay status elements", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Revelio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to Bitbucket Cloud" })).toBeVisible();
  await expect(page.getByText(/phase\s*0/i)).toHaveCount(0);
  await expect(page.getByText(/diagnostics/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open diff demo" })).toHaveCount(0);
  await expect(page.getByText(/fast\s+review/i)).toHaveCount(0);
  await expect(page).toHaveTitle("Revelio");

  const visibleOverlays = await page.locator("body *").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.position !== "absolute" && style.position !== "fixed") return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      })
      .map((element) => element.tagName.toLowerCase()),
  );
  expect(visibleOverlays).toEqual([]);
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
