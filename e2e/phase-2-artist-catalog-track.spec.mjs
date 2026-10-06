import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const outputDir = process.env.SLICE_1_QA_OUTPUT_DIR || "/tmp/sync-exchange-phase-2-slice-1";

test.beforeAll(async () => {
  await fs.mkdir(outputDir, { recursive: true });
});

async function addArtistSession(context) {
  await context.addCookies([{
    name: "sync-exchange-session",
    value: JSON.stringify({
      id: "artist-1",
      email: "maya@sync.exchange",
      role: "artist",
      fullName: "Maya Sol",
      onboardingComplete: true
    }),
    url: baseURL
  }]);
}

async function assertNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
}

async function assertCatalogAndDetail(page, label) {
  await page.goto("/artist/catalog");
  await expect(page.getByRole("heading", { level: 1, name: "Your music, organized." })).toBeVisible();
  await expect(page.getByRole("table", { name: "Artist catalog" })).toBeVisible();
  const midnightRun = page.getByRole("link", { name: "Midnight Run", exact: true });
  await expect(midnightRun).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, `catalog-${label}.png`), fullPage: true });

  await midnightRun.click();
  await expect(page.getByRole("heading", { level: 1, name: "Midnight Run" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, `track-detail-${label}.png`), fullPage: true });
}

for (const scenario of [
  { label: "1440-dark", width: 1440, height: 1000, colorScheme: "dark" },
  { label: "1024-dark", width: 1024, height: 900, colorScheme: "dark" },
  { label: "390-dark", width: 390, height: 844, colorScheme: "dark" },
  { label: "1440-light", width: 1440, height: 1000, colorScheme: "light" },
  { label: "1024-light", width: 1024, height: 900, colorScheme: "light" },
  { label: "390-light", width: 390, height: 844, colorScheme: "light" }
]) {
  test(`Catalog and Track Detail conform at ${scenario.label}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.colorScheme
    });
    await context.addInitScript(theme => window.localStorage.setItem("theme", theme), scenario.colorScheme);
    await addArtistSession(context);
    const page = await context.newPage();
    await assertCatalogAndDetail(page, scenario.label);
    await context.close();
  });
}

test("Catalog search, empty result, tabs, and Buyer Preview remain truthful", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
  await addArtistSession(context);
  const page = await context.newPage();

  await page.goto("/artist/catalog?query=no-such-track");
  await expect(page.getByRole("heading", { name: "No tracks match this view" })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "catalog-search-empty-dark.png"), fullPage: true });

  await page.goto("/artist/tracks/midnight-run");
  const rightsTab = page.getByRole("tab", { name: /Rights & Splits/ });
  await rightsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Licensing" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeFocused();
  await rightsTab.click();
  await expect(page.getByRole("heading", { name: "Recording (Master) rights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Composition (Publishing) rights" })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: path.join(outputDir, "track-detail-rights-deferred-dark.png"), fullPage: true });

  await page.getByRole("link", { name: "Buyer Preview" }).click();
  await expect(page.getByText("This view contains only buyer-visible track information.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit Preview" })).toBeVisible();
  for (const privateText of ["Full Master", "Artist activity", "Finance", "Business & Representation"]) {
    await expect(page.getByText(privateText, { exact: false })).toHaveCount(0);
  }
  await page.screenshot({ path: path.join(outputDir, "buyer-safe-track-preview-dark.png"), fullPage: true });
  await context.close();
});

test("shared preview player switches context and exposes seek, mute, and volume", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await addArtistSession(context);
  const page = await context.newPage();
  await page.goto("/artist/catalog");

  const previewButtons = page.getByRole("button", { name: /Play Buyer preview/ });
  await expect(previewButtons.first()).toBeVisible();
  await previewButtons.first().click();
  const player = page.getByTestId("persistent-preview-player");
  await expect(player).toBeVisible();
  await expect(player.getByRole("slider", { name: "Buyer preview position" })).toBeVisible();
  await expect(player.getByRole("slider", { name: "Buyer preview volume" })).toBeVisible();
  await expect(player.getByRole("button", { name: /Mute Buyer preview|Unmute Buyer preview/ })).toBeVisible();
  const firstTitle = await player.locator("strong").first().textContent();
  await previewButtons.nth(1).click();
  await expect(player.locator("strong").first()).not.toHaveText(firstTitle || "");
  await expect(page.locator("audio")).toHaveCount(1);
  await page.screenshot({ path: path.join(outputDir, "persistent-player-desktop-dark.png") });
  await context.close();
});

test("mobile player and touch controls remain usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await addArtistSession(context);
  const page = await context.newPage();
  await page.goto("/artist/tracks/midnight-run");
  await page.getByRole("button", { name: /Play Buyer preview/ }).first().click();
  const player = page.getByTestId("persistent-preview-player");
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "Open volume control" }).click();
  await expect(player.getByRole("slider", { name: "Buyer preview volume" })).toBeVisible();
  const controls = await player.locator("button").evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length > 0)
    .map(node => ({
      name: node.getAttribute("aria-label"),
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height
    })));
  expect(controls.filter(control => control.name).every(control => control.width >= 44 && control.height >= 44)).toBeTruthy();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(outputDir, "persistent-player-mobile-dark.png") });
  await context.close();
});

for (const scenario of [
  { label: "desktop-dark", width: 1440, height: 900, theme: "dark" },
  { label: "desktop-light", width: 1440, height: 900, theme: "light" },
  { label: "mobile-dark", width: 390, height: 844, theme: "dark" },
  { label: "mobile-light", width: 390, height: 844, theme: "light" }
]) {
  test(`preview failure is visible and safely retryable at ${scenario.label}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.theme
    });
    await context.addInitScript(theme => window.localStorage.setItem("theme", theme), scenario.theme);
    await addArtistSession(context);
    let requests = 0;
    await context.route("**/demo/audio-preview.wav", route => {
      requests += 1;
      return requests === 1 ? route.abort() : route.continue();
    });

    const page = await context.newPage();
    await page.goto("/artist/catalog");
    await page.getByRole("button", { name: /Play Buyer preview/ }).first().click();
    const player = page.getByTestId("persistent-preview-player");
    await expect(player.getByText("Midnight Run")).toBeVisible();
    const failure = player.getByRole("alert");
    await expect(failure).toBeVisible();
    await expect(failure).toContainText("Buyer preview unavailable");
    await expect(failure).not.toContainText("demo/audio-preview.wav");
    const retry = failure.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, `player-failure-${scenario.label}.png`) });

    await retry.click();
    await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
    await expect(failure).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await context.close();
  });
}

test("Artist A, Buyer, and anonymous users cannot cross Artist boundaries", async ({ browser }) => {
  const artistContext = await browser.newContext();
  await addArtistSession(artistContext);
  const artistPage = await artistContext.newPage();
  await artistPage.goto("/artist/tracks/open-highway");
  await expect(artistPage).toHaveURL(/\/artist\/tracks\/open-highway/);
  await expect(artistPage.getByTestId("artist-track-detail")).toHaveCount(0);
  await artistContext.close();

  for (const session of [
    { id: "buyer-1", email: "music@northframe.co", role: "buyer" },
    null
  ]) {
    const context = await browser.newContext();
    if (session) await context.addCookies([{ name: "sync-exchange-session", value: JSON.stringify({ ...session, fullName: "QA", onboardingComplete: true }), url: baseURL }]);
    const page = await context.newPage();
    await page.goto("/artist/tracks/midnight-run");
    await expect(page).toHaveURL(/\/login|\/buyer\/dashboard/);
    await expect(page.getByTestId("artist-track-detail")).toHaveCount(0);
    await context.close();
  }
});
