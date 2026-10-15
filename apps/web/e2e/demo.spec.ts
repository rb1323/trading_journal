import { expect, test } from "@playwright/test";

test("public demo is available without authentication", async ({ page }) => {
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/") || url.includes("supabase.co") || url.includes("alpaca.markets")) forbiddenRequests.push(url);
  });
  await page.goto("/demo");
  await expect(page.getByText("Synthetic demo data · Read only")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tutustu dashboardiin →" })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Treidit", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/trades$/);
  await expect(page.getByRole("heading", { name: "Treidit" })).toBeVisible();
  await page.locator(".demo-table-card tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/demo\/trades\/demo-trade-/);
  await expect(page.getByText("Synthetic OHLCV")).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});

test("production pages remain protected", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
