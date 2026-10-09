import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { createAdminV2SliceAFixture, removeAdminV2SliceAFixture } from "../tests/helpers/admin-v2-slice-a-fixture.mjs";

const enabled = process.env.E2E_ADMIN_V2_SLICE_A === "true";
const gallery = process.env.ADMIN_V2_GALLERY_DIR || "/private/tmp/tse-admin-v2-slice-a-gallery";
test.beforeAll(async () => {
  if (!enabled) return;
  await createAdminV2SliceAFixture();
  await fs.mkdir(gallery, { recursive: true });
});
test.afterAll(async () => { if (enabled) await removeAdminV2SliceAFixture(); });
test.beforeEach(() => test.skip(!enabled, "Explicit localhost demo fixture required"));

for (const width of [1440, 1024, 390, 320]) {
  for (const theme of ["dark", "light"]) {
    test(`Admin V2 ${width}px ${theme} conformance and gallery`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      await context.addInitScript(value => localStorage.setItem("theme", value), theme);
      const page = await context.newPage();
      for (const [view, state, heading] of [
        ["overview", "populated", "What needs my attention?"],
        ["overview", "zero", "Nothing needs review right now."],
        ["actions", "populated", "Action Center"],
        ["actions", "zero", "Nothing needs review right now."],
        ["overview", "partial", "What needs my attention?"],
        ["overview", "error", "Attention status is unavailable."],
        ["overview", "loading", null]
      ]) {
        await page.goto(`/v2-admin-slice-a-fixture-local?view=${view}&state=${state}`);
        if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        else await expect(page.getByRole("status", { name: "Loading Admin workspace" })).toBeVisible();
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        else await expect(page.locator("html")).not.toHaveClass(/dark/);
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (state === "zero" && view === "overview") {
          await expect(page.getByText("Awaiting review")).toBeVisible();
          await expect(page.getByRole("link", { name: /Awaiting review: 0/ })).toBeVisible();
          await expect(page.getByText("Blue Hour")).toHaveCount(0);
        }
        if (state === "error") {
          await expect(page.getByRole("alert").first()).toBeVisible();
          await expect(page.getByRole("link", { name: /Awaiting review: unavailable/ })).toBeVisible();
        }
        if (state === "partial") {
          await expect(page.getByText("Some operational sources could not be read.", { exact: false })).toBeVisible();
          await expect(page.getByRole("link", { name: /Open flags: unavailable/ })).toBeVisible();
        }
        if (state === "populated") {
          await expect(page.getByRole("link", { name: /Inspect track flag Blue Hour/ })).toHaveAttribute("href", "/admin/tracks/track-fixture-a");
          await expect(page.getByText("Critical", { exact: true }).first()).toBeVisible();
        }
        if (view === "actions" && state === "populated") {
          await page.getByRole("button", { name: "Review", exact: true }).click();
          await expect(page.getByText("Critical", { exact: true }).first()).toBeVisible();
          await expect(page.getByText("Unresolved Critical items stay visible in every filter.")).toBeVisible();
        }
        await page.screenshot({ path: path.join(gallery, `after-${view}-${state}-${width}-${theme}.png`), fullPage: true });
      }
      if (width <= 390) {
        await page.getByRole("button", { name: "Open Admin navigation" }).click();
        await expect(page.locator("#admin-navigation button").first()).toBeFocused();
        await expect(page.getByRole("link", { name: "Action Center", exact: true })).toBeVisible();
        await expect(page.getByText("Trusted Artists", { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(gallery, `after-mobile-menu-${width}-${theme}.png`), fullPage: false });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Open Admin navigation" })).toBeFocused();
      }
      if ((width === 1440 && theme === "dark") || (width === 390 && theme === "light")) {
        await page.goto("/v2-admin-slice-a-fixture-local?view=actions&state=populated");
        await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
        const violations = await page.evaluate(async () => {
          const results = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
          return results.violations.map(({ id, nodes }) => `${id}: ${nodes.map(node => node.target.join(" ")).join(", ")}`);
        });
        expect(violations).toEqual([]);
      }
      await context.close();
    });
  }
}

test("actual Admin pages require canonical Admin session and preserve existing routes", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId("login-email").fill("admin@thesyncexchange.com");
  await page.getByTestId("login-password").fill("fictional-local-only");
  await page.getByTestId("login-submit").click();
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "sync-exchange-session")).toBe(true);
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "What needs my attention?" })).toBeVisible();
  await page.goto("/admin/action-center");
  await expect(page.getByRole("heading", { name: "Action Center", exact: true })).toBeVisible();
  await page.goto("/admin/review-queue");
  await expect(page.getByRole("heading", { name: /Review the queue/ })).toBeVisible();
  await context.close();
});

for (const [role, email] of [["Artist", "maya@sync.exchange"], ["Buyer", "music@northframe.co"]]) {
  test(`${role} cannot enter Admin Overview or Action Center`, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill("fictional-local-only");
    await page.getByTestId("login-submit").click();
    await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "sync-exchange-session")).toBe(true);
    for (const route of ["/admin/dashboard", "/admin/action-center"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { name: "What needs my attention?" })).toHaveCount(0);
    }
    await context.close();
  });
}
