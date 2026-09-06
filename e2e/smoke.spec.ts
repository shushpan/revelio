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

  const bodyColors = () =>
    page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      return { background: style.backgroundColor, color: style.color };
    });

  await expect(page.getByRole("heading", { name: "Connect to Bitbucket Cloud" })).toBeVisible();
  const lightColors = await bodyColors();
  expect(lightColors.background).toBe("rgb(250, 250, 250)");
  expect(lightColors.color).toBe("rgb(24, 24, 27)");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // The whole app shell, not just isolated components, must actually repaint
  // dark: the page background and default text color must both flip so
  // body text stays legible against dark surfaces (not near-black-on-black).
  const darkColors = await bodyColors();
  expect(darkColors.background).toBe("rgb(9, 9, 11)");
  expect(darkColors.color).toBe("rgb(250, 250, 250)");

  await page.getByRole("button", { name: "System" }).click();
  await expect(page.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
