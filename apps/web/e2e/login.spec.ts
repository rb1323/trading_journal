import { expect, test } from "@playwright/test";

test("shows a clear setup state when Supabase is not configured", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Yhdistä Supabase|Tervetuloa takaisin/)).toBeVisible();
});

