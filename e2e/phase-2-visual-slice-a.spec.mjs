import { expect, test } from "@playwright/test";
import { createVisualSliceAFixture, removeVisualSliceAFixture } from "../tests/helpers/visual-slice-a-fixture.mjs";

const fixtures = process.env.E2E_VISUAL_SLICE_A_FIXTURES === "true";
test.beforeAll(async () => { if (fixtures) await createVisualSliceAFixture(); });
test.afterAll(async () => { if (fixtures) await removeVisualSliceAFixture(); });
test.beforeEach(() => { test.skip(!fixtures, "Explicit localhost-only zero-data fixture required"); });

const views = [
  { view: "artist-overview", heading: "Start with your first track.", action: "Submit music" },
  { view: "artist-catalog", heading: "Your catalog starts with one track.", action: "Add your first track" },
  { view: "buyer-discovery", heading: "New music is on its way.", action: null },
  { view: "buyer-purchases", heading: "Your purchases will live here.", action: "Discover music" },
];

for (const { view, heading, action } of views) {
  for (const width of [1440, 1024, 390, 320]) {
    for (const theme of ["dark", "light"]) {
      test(`${view} first use at ${width}px ${theme}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
        await context.addInitScript(value => localStorage.setItem("theme", value), theme);
        const page = await context.newPage();
        await page.goto(`/visual-slice-a-fixture-local?view=${view}`);
        const firstUse = page.locator("main section[aria-label]").first();
        await expect(firstUse.getByRole("heading", { name: heading })).toBeVisible();
        await expect(page.locator("main")).not.toContainText("Midnight Run");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (action) {
          const link = firstUse.getByRole("link", { name: action });
          await expect(link).toBeVisible();
          const box = await link.boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(44);
          await link.focus();
          await expect(link).toBeFocused();
        }
        if (view === "artist-catalog") await expect(page.getByRole("searchbox", { name: "Search your catalog" })).toHaveCount(0);
        if (view === "buyer-discovery") await expect(page.getByRole("searchbox", { name: "Find your next track" })).toHaveCount(0);
        if (view === "buyer-purchases") await expect(page.getByLabel("Search by exact order reference")).toHaveCount(0);
        if (width <= 390) await expect(page.getByRole("link", { name: "The Sync Exchange home" })).toBeVisible();
        if ((width === 1440 && theme === "dark") || (width === 390 && theme === "light")) {
          await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
          const violations = await page.evaluate(async () => {
            const audit = await window.axe.run("main", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
            return audit.violations.map(item => item.id);
          });
          expect(violations).toEqual([]);
        }
        await context.close();
      });
    }
  }
}
