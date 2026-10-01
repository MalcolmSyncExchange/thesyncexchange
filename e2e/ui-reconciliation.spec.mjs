import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const outputDir = process.env.UI_QA_OUTPUT_DIR || "/tmp/sync-exchange-ui-reconciliation";

test.beforeAll(async () => {
  await fs.mkdir(outputDir, { recursive: true });
});

test("homepage hero matches the approved cinematic responsive treatment", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await desktop.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const page = await desktop.newPage();
  await page.goto("/");

  const hero = page.locator("section[aria-labelledby='home-title']");
  const artwork = hero.locator("img");
  await expect(hero.getByRole("heading", { level: 1, name: "Find it. Clear it. License it." })).toBeVisible();
  await expect(hero.getByRole("link", { name: "Search music" })).toBeVisible();
  await expect(hero.getByRole("link", { name: "List your music" })).toBeVisible();
  await expect(hero.locator("figure, figcaption")).toHaveCount(0);
  await expect(artwork).toHaveAttribute("src", /sync-sound-sculpture-hero/);
  const nativeCursorState = await page.evaluate(() => ({
    body: getComputedStyle(document.body).cursor,
    primaryAction: getComputedStyle(document.querySelector("a[href='/discover']")).cursor,
    customCursorElements: document.querySelectorAll("[class*='brand-cursor'], [class*='brandCursor']").length
  }));
  expect(nativeCursorState.body).not.toContain("url(");
  expect(nativeCursorState.primaryAction).toBe("pointer");
  expect(nativeCursorState.customCursorElements).toBe(0);
  await page.mouse.move(1120, 420);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.querySelectorAll("[class*='brand-cursor'], [class*='brandCursor']").length)).toBe(0);
  const artworkSource = await artwork.evaluate((image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    currentSrc: image.currentSrc
  }));
  expect(artworkSource.naturalWidth).toBeGreaterThanOrEqual(1440);
  expect(artworkSource.naturalHeight).toBeGreaterThanOrEqual(590);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

  await hero.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (animation.timeline === document.timeline) {
        animation.pause();
        animation.currentTime = 0;
      }
    }
  });
  await hero.screenshot({ path: path.join(outputDir, "homepage-hero-desktop-dark-initial.png") });

  await page.reload();
  await page.waitForTimeout(900);
  await page.locator("section[aria-labelledby='home-title']").screenshot({ path: path.join(outputDir, "homepage-hero-desktop-dark.png") });
  await page.evaluate(() => window.scrollTo(0, 320));
  await page.screenshot({ path: path.join(outputDir, "homepage-hero-desktop-dark-scrolled.png") });
  await page.getByRole("heading", { level: 2, name: "From first listen to license record." }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "homepage-hero-to-how-it-works-dark.png") });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.locator("section[aria-labelledby='home-title']").screenshot({ path: path.join(outputDir, "homepage-hero-desktop-light.png") });
  await desktop.close();

  const wideDesktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "dark" });
  await wideDesktop.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const widePage = await wideDesktop.newPage();
  await widePage.goto("/");
  await widePage.waitForTimeout(900);
  const wideHero = widePage.locator("section[aria-labelledby='home-title']");
  const wideArtwork = wideHero.locator("img");
  const wideMetrics = await wideArtwork.evaluate((image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    renderedWidth: image.getBoundingClientRect().width,
    renderedHeight: image.getBoundingClientRect().height
  }));
  expect(wideMetrics.naturalWidth).toBe(1920);
  expect(wideMetrics.naturalHeight).toBe(800);
  expect(wideMetrics.renderedWidth).toBeGreaterThan(1920);
  expect(wideMetrics.renderedWidth).toBeLessThan(1960);
  expect(wideMetrics.renderedHeight).toBeGreaterThanOrEqual(680);
  expect(await widePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await wideHero.screenshot({ path: path.join(outputDir, "homepage-hero-desktop-1920-dark.png") });
  await widePage.screenshot({ path: path.join(outputDir, "homepage-waveform-1920-closeup.png"), clip: { x: 900, y: 140, width: 960, height: 660 } });
  await wideDesktop.close();

  const retina = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await retina.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const retinaPage = await retina.newPage();
  await retinaPage.goto("/");
  await retinaPage.waitForTimeout(900);
  await retinaPage.locator("section[aria-labelledby='home-title']").screenshot({ path: path.join(outputDir, "homepage-hero-retina-2x-dark.png") });
  await retina.close();

  const tablet = await browser.newContext({ viewport: { width: 834, height: 1112 }, colorScheme: "dark" });
  await tablet.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const tabletPage = await tablet.newPage();
  await tabletPage.goto("/");
  await tabletPage.waitForTimeout(900);
  expect(await tabletPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await tabletPage.locator("section[aria-labelledby='home-title']").screenshot({ path: path.join(outputDir, "homepage-hero-tablet-dark.png") });
  await tablet.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await mobile.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const mobilePage = await mobile.newPage();
  await mobilePage.goto("/");
  await mobilePage.waitForTimeout(900);
  const mobileHero = mobilePage.locator("section[aria-labelledby='home-title']");
  const mobileArtwork = mobileHero.locator("img");
  await expect.poll(() => mobileArtwork.evaluate((image) => image.currentSrc)).toContain("sync-sound-sculpture-hero-mobile");
  await expect(mobileHero.getByRole("link", { name: "Search music" })).toHaveCSS("width", "354px");
  expect(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await mobileHero.screenshot({ path: path.join(outputDir, "homepage-hero-mobile-dark.png") });
  await mobile.close();

  const mobileLight = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  await mobileLight.addInitScript(() => window.localStorage.setItem("theme", "light"));
  const mobileLightPage = await mobileLight.newPage();
  await mobileLightPage.goto("/");
  await mobileLightPage.waitForTimeout(900);
  await expect(mobileLightPage.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => mobileLightPage.locator("section[aria-labelledby='home-title'] img").evaluate((image) => image.currentSrc)).toContain("sync-sound-sculpture-hero-mobile");
  await mobileLightPage.locator("section[aria-labelledby='home-title']").screenshot({ path: path.join(outputDir, "homepage-hero-mobile-light.png") });
  await mobileLight.close();

  const reduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto("/");
  const reducedHeading = reducedPage.getByRole("heading", { level: 1, name: "Find it. Clear it. License it." });
  await expect(reducedHeading).toHaveCSS("opacity", "1");
  await expect(reducedHeading).toHaveCSS("transform", "none");
  expect(await reducedPage.locator("section[aria-labelledby='home-title'] img").evaluate((image) => getComputedStyle(image).animationName)).toBe("none");
  await reduced.close();
});

test("public design, responsive navigation, theme persistence, and brand geometry", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addInitScript(() => {
    if (!window.localStorage.getItem("theme")) window.localStorage.setItem("theme", "dark");
  });
  const page = await desktop.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Find it. Clear it. License it." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDir, "homepage-desktop-dark.png"), fullPage: true });

  const headerLogo = page.locator("header img:visible").first();
  const footerLogo = page.locator("footer img:visible").first();
  const [headerImage, footerImage] = await Promise.all([
    headerLogo.evaluate((image) => ({ currentSrc: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete })),
    footerLogo.evaluate((image) => ({ currentSrc: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete }))
  ]);
  expect(headerImage.complete).toBeTruthy();
  expect(footerImage.complete).toBeTruthy();
  expect(headerImage.naturalWidth).toBeGreaterThan(1000);
  expect(headerImage.naturalHeight).toBeGreaterThan(200);
  expect(footerImage.currentSrc).toBe(headerImage.currentSrc);
  await headerLogo.screenshot({ path: path.join(outputDir, "logo-header-dark-closeup.png") });
  await footerLogo.screenshot({ path: path.join(outputDir, "logo-footer-dark-closeup.png") });

  const homeThemeToggle = page.getByRole("button", { name: "Toggle color theme" });
  await expect(homeThemeToggle).toHaveAttribute("title", "Switch to light mode");
  await homeThemeToggle.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("light");
  await page.screenshot({ path: path.join(outputDir, "homepage-desktop-light.png"), fullPage: true });
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("heading", { level: 1, name: "Music licensing has too many disconnected steps." })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, "about-desktop-light.png"), fullPage: true });

  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Pick up where you left off." })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({ path: path.join(outputDir, "login-desktop-light.png"), fullPage: true });
  const loginThemeToggle = page.getByRole("button", { name: "Toggle color theme" });
  await expect(loginThemeToggle).toHaveAttribute("title", "Switch to dark mode");
  await loginThemeToggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("dark");
  await page.screenshot({ path: path.join(outputDir, "login-desktop-dark.png"), fullPage: true });

  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto("/");
  await expect(mobilePage.getByRole("button", { name: "Open menu" })).toBeVisible();
  await mobilePage.waitForTimeout(900);
  await mobilePage.screenshot({ path: path.join(outputDir, "homepage-mobile.png"), fullPage: true });
  await mobilePage.getByRole("button", { name: "Open menu" }).click();
  await expect(mobilePage.getByRole("dialog", { name: "Explore The Sync Exchange" })).toBeVisible();
  await mobilePage.screenshot({ path: path.join(outputDir, "navigation-mobile.png") });
  await mobilePage.keyboard.press("Escape");
  await expect(mobilePage.getByRole("dialog", { name: "Explore The Sync Exchange" })).toBeHidden();
  await mobilePage.goto("/login");
  await mobilePage.screenshot({ path: path.join(outputDir, "login-mobile.png"), fullPage: true });
  await mobile.close();
});

test("buyer and artist shells retain approved branding at desktop and mobile", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const buyerPage = await desktop.newPage();
  await buyerPage.goto("/login");
  await buyerPage.getByTestId("login-email").fill("music@northframe.co");
  await buyerPage.getByTestId("login-password").fill("local-visual-qa");
  await buyerPage.getByTestId("login-submit").click();
  await buyerPage.waitForURL(/\/buyer\/dashboard/);
  await expect(buyerPage.getByRole("heading", { level: 1, name: "Your next project starts here." })).toBeVisible();
  await buyerPage.screenshot({ path: path.join(outputDir, "buyer-shell-desktop.png"), fullPage: true });

  const artistPage = await desktop.newPage();
  await artistPage.goto("/login");
  await artistPage.getByTestId("login-email").fill("maya@sync.exchange");
  await artistPage.getByTestId("login-password").fill("local-visual-qa");
  await artistPage.getByTestId("login-submit").click();
  await artistPage.waitForURL(/\/artist\/dashboard/);
  await expect(artistPage.getByText("Artist workspace", { exact: false }).first()).toBeVisible();
  await artistPage.screenshot({ path: path.join(outputDir, "artist-shell-desktop.png"), fullPage: true });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileBuyer = await mobile.newPage();
  await mobileBuyer.goto("/login");
  await mobileBuyer.getByTestId("login-email").fill("music@northframe.co");
  await mobileBuyer.getByTestId("login-password").fill("local-visual-qa");
  await mobileBuyer.getByTestId("login-submit").click();
  await mobileBuyer.waitForURL(/\/buyer\/dashboard/);
  await expect(mobileBuyer.getByRole("button", { name: "Open buyer navigation" })).toBeVisible();
  await mobileBuyer.screenshot({ path: path.join(outputDir, "buyer-shell-mobile.png"), fullPage: true });
  await mobileBuyer.getByRole("button", { name: "Open buyer navigation" }).click();
  await expect(mobileBuyer.getByRole("dialog", { name: "Buyer workspace" })).toBeVisible();
  await mobileBuyer.keyboard.press("Escape");
  await expect(mobileBuyer.getByRole("dialog", { name: "Buyer workspace" })).toBeHidden();
  await mobile.close();
});

test("primary public and auth routes expose basic accessible structure", async ({ page }) => {
  for (const route of ["/", "/discover", "/about", "/faq", "/contact", "/login", "/signup"]) {
    await page.goto(route);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    const unlabeledControls = await page.locator('input:not([type="hidden"]), select, textarea').evaluateAll((controls) =>
      controls
        .filter((control) => {
          const id = control.getAttribute("id");
          const hasLabel = Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
          return !hasLabel && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby");
        })
        .map((control) => control.outerHTML)
    );
    expect(unlabeledControls, `${route} has unlabeled form controls`).toEqual([]);
  }

  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBeTruthy();
});
