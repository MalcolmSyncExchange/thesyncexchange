import path from "node:path";
import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createVisualSliceBFixture, removeVisualSliceBFixture } from "../tests/helpers/visual-slice-b-fixture.mjs";

const fixtures = process.env.E2E_VISUAL_SLICE_B_FIXTURES === "true";
const output = process.env.SLICE_B_QA_OUTPUT_DIR || "/private/tmp/sync-exchange-visual-slice-b";
test.beforeAll(async () => { if (fixtures) { await fs.mkdir(output, { recursive: true }); await createVisualSliceBFixture(); } });
test.afterAll(async () => { if (fixtures) await removeVisualSliceBFixture(); });
test.beforeEach(() => { test.skip(!fixtures, "Explicit localhost-only populated fixtures required"); });

async function openFixture(browser, width, theme, query) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await context.addInitScript(value => localStorage.setItem("theme", value), theme);
  const page = await context.newPage();
  await page.goto(`/visual-slice-b-fixture-local?${query}`);
  return { context, page };
}

async function assertNoOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter(element => {
        const { left, right } = element.getBoundingClientRect();
        if (left >= -1 && right <= window.innerWidth + 1) return false;
        const tablist = element.closest('[role="tablist"]');
        if (tablist && tablist.getBoundingClientRect().right <= window.innerWidth + 1 && getComputedStyle(tablist).overflowX === "auto") return false;
        return true;
      })
      .slice(0, 8)
      .map(element => {
        const { left, right, width } = element.getBoundingClientRect();
        return `${element.tagName}.${String(element.className).slice(0, 90)}:${left},${right},${width}`;
      })
  }));
  expect(layout, JSON.stringify(layout)).toMatchObject({ viewport: layout.document, body: layout.viewport, offenders: [] });
}

async function captureFixture(page, options) {
  // Next's local development indicator is outside the product UI.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot(options);
}

for (const width of [1440, 1024, 390, 320]) {
  for (const theme of ["dark", "light"]) {
    test(`populated Catalog and approved Detail at ${width}px ${theme}`, async ({ browser }) => {
      const { context, page } = await openFixture(browser, width, theme, "view=catalog");
      await expect(page.getByRole("heading", { level: 1, name: "Your music, organized." })).toBeVisible();
      const library = page.getByRole("table", { name: "Artist catalog" });
      await expect(library.getByRole("row")).toHaveCount(width <= 850 ? 8 : 9);
      await expect(library.getByRole("link", { name: "Midnight Run", exact: true })).toBeVisible();
      await expect(library.getByText("Changes requested")).toBeVisible();
      await expect(library.getByText("Archived", { exact: true })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Search your catalog" })).toBeVisible();
      await assertNoOverflow(page);
      await captureFixture(page, { path: path.join(output, `catalog-${width}-${theme}.png`), fullPage: true });
      if (width <= 390) {
        const play = library.getByRole("button", { name: /Play Buyer preview/ }).first();
        const bounds = await play.boundingBox();
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        await expect(library.getByRole("link", { name: "View details for Midnight Run" })).toBeVisible();
      }
      await page.goto("/visual-slice-b-fixture-local?view=detail&state=approved");
      await expect(page.getByRole("heading", { level: 1, name: "Midnight Run" })).toBeVisible();
      await expect(page.getByText("Review approved · visible in Discover")).toBeVisible();
      await expect(page.getByRole("link", { name: "Buyer Preview" })).toHaveAttribute("href", "/artist/tracks/approved/preview");
      await expect(page.getByRole("button", { name: /Play Buyer preview/ })).toBeVisible();
      await assertNoOverflow(page);
      if (width <= 390) {
        for (const name of ["Buyer Preview", "Edit track"]) {
          const bounds = await page.getByRole("link", { name }).boundingBox();
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
      }
      await captureFixture(page, { path: path.join(output, `detail-approved-${width}-${theme}.png`), fullPage: true });
      if ((width === 1440 && theme === "dark") || (width === 390 && theme === "light")) {
        await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
        const violations = await page.evaluate(async () => (await window.axe.run("main", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(item => item.id));
        expect(violations).toEqual([]);
      }
      await context.close();
    });
  }
}

for (const state of ["draft", "pending", "rejected", "archived", "approved-needs-attention", "minimal", "long-title"]) {
  test(`Track Detail ${state} presents only supported facts`, async ({ browser }) => {
    const { context, page } = await openFixture(browser, 1440, "dark", `view=detail&state=${state}`);
    await expect(page.getByTestId("artist-track-detail")).toBeVisible();
    await expect(page.getByRole("link", { name: "Buyer Preview" })).toBeVisible();
    await expect(page.getByText(state === "long-title" ? "Review approved · visible in Discover" : /Buyer visibility:/).first()).toBeVisible();
    await expect(page.getByText("Ready for licensing", { exact: true })).toHaveCount(0);
    await assertNoOverflow(page);
    await captureFixture(page, { path: path.join(output, `detail-${state}-1440-dark.png`), fullPage: true });
    await context.close();
  });
}

test("long title, missing artwork, and first-use / filtered-empty states survive at 320px", async ({ browser }) => {
  const { context, page } = await openFixture(browser, 320, "dark", "view=catalog");
  await expect(page.getByRole("link", { name: "An Exceptionally Long Fictional Track Title for a Narrow Catalog Screen and a Second Line of Text", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "First Light", exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await captureFixture(page, { path: path.join(output, "catalog-long-missing-320-dark.png"), fullPage: true });
  await page.goto("/visual-slice-b-fixture-local?view=empty");
  await expect(page.getByRole("heading", { name: "Your catalog starts with one track." })).toBeVisible();
  await page.goto("/visual-slice-b-fixture-local?view=filtered-empty");
  await expect(page.getByRole("heading", { name: "No tracks match this view" })).toBeVisible();
  await context.close();
});
