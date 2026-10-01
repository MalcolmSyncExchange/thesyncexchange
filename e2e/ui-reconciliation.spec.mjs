import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const outputDir = process.env.UI_QA_OUTPUT_DIR || "/tmp/sync-exchange-ui-reconciliation";

test.beforeAll(async () => {
  await fs.mkdir(outputDir, { recursive: true });
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
