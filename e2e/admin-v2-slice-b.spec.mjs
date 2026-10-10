import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { createAdminV2SliceBFixture, removeAdminV2SliceBFixture } from "../tests/helpers/admin-v2-slice-b-fixture.mjs";

const enabled = process.env.E2E_ADMIN_V2_SLICE_B === "true";
const gallery = process.env.ADMIN_V2_GALLERY_DIR || "/private/tmp/tse-admin-v2-slice-b-gallery";
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.beforeAll(async () => { if (enabled) { await createAdminV2SliceBFixture(); await fs.mkdir(gallery, { recursive: true }); } });
test.afterAll(async () => { if (enabled) await removeAdminV2SliceBFixture(); });
test.beforeEach(() => test.skip(!enabled, "Explicit localhost demo fixture required"));

async function session(context, id, email, role) {
  await context.addCookies([{ name: "sync-exchange-session", url: baseURL, value: JSON.stringify({ id, email, role, fullName: email.split("@")[0], onboardingComplete: true }) }]);
}

for (const width of [1440, 1024, 390, 320]) {
  for (const theme of ["dark", "light"]) {
    test(`Slice B ${width}px ${theme} layout, states and gallery`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      await context.addInitScript(value => localStorage.setItem("theme", value), theme);
      const page = await context.newPage();
      const scenes = [
        ["users-three", "?view=users&state=three", "Users"],
        ["users-many", "?view=users&state=many", "Users"],
        ["users-no-results", "?view=users&state=no-results", "No matching people"],
        ["users-empty", "?view=users&state=empty", "No user profiles yet"],
        ["users-loading", "?view=users&state=loading", "Loading users"],
        ["users-error", "?view=users&state=error", "User records are unavailable."],
        ["detail-artist", "?view=detail&role=artist&state=populated", "Recent tracks"],
        ["detail-buyer", "?view=detail&role=buyer&state=populated", "Recent purchases"],
        ["detail-admin", "?view=detail&role=admin&state=populated", "Connected work"],
        ["detail-partial", "?view=detail&role=buyer&state=partial", "Some records are unavailable."],
        ["detail-empty", "?view=detail&role=artist&state=empty", "No tracks on file"],
        ["detail-not-found", "?view=detail&state=not-found", "User unavailable"]
      ];
      for (const [name, suffix, heading] of scenes) {
        await page.goto(`/v2-admin-slice-b-fixture-local${suffix}`);
        if (name === "users-loading") await expect(page.getByRole("status", { name: heading })).toBeVisible();
        else if (name === "detail-partial") await expect(page.getByRole("alert").first()).toContainText(heading);
        else await expect(page.getByRole("heading", { name: heading, exact: false }).first()).toBeVisible();
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        else await expect(page.locator("html")).not.toHaveClass(/dark/);
        await page.screenshot({ path: path.join(gallery, `after-${name}-${width}-${theme}.png`), fullPage: true });
      }
      if ((width === 1440 && theme === "dark") || (width === 390 && theme === "light")) {
        await page.goto("/v2-admin-slice-b-fixture-local?view=users&state=three");
        await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`));
        expect(violations).toEqual([]);
        await page.goto("/v2-admin-slice-b-fixture-local?view=detail&role=buyer&state=populated");
        await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
        const detailViolations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`));
        expect(detailViolations).toEqual([]);
      }
      await context.close();
    });
  }
}

test("real demo Admin directory supports search, role filter, detail and keyboard focus", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await session(context, "admin-1", "admin@thesyncexchange.com", "admin");
  const page = await context.newPage();
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search name or email" }).fill("Maya");
  await page.getByRole("combobox", { name: "Role" }).selectOption("artist");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Maya Sol", { exact: true })).toBeVisible();
  await expect(page.getByText("Elena Park", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search name or email" }).fill("fictional-no-match");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No matching people" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page.getByText("Maya Sol", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Inspect Maya Sol" }).focus();
  await expect(page.getByRole("link", { name: "Inspect Maya Sol" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Recent tracks" })).toBeVisible();
  await page.screenshot({ path: path.join(gallery, "actual-demo-admin-artist-detail-390.png"), fullPage: true });
  await context.close();
});

test("anonymous, Artist and Buyer cannot read directory or arbitrary user detail", async ({ browser }) => {
  for (const actor of [null, ["artist-1", "maya@sync.exchange", "artist"], ["buyer-1", "music@northframe.co", "buyer"]]) {
    const context = await browser.newContext();
    if (actor) await session(context, ...actor);
    const page = await context.newPage();
    for (const route of ["/admin/users", "/admin/users/11111111-1111-4111-8111-111111111111"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByText("mara.vale@example.test")).toHaveCount(0);
    }
    await context.close();
  }
});

test("Admin malformed and nonexistent user IDs fail without private profile data", async ({ browser }) => {
  const context = await browser.newContext();
  await session(context, "admin-1", "admin@thesyncexchange.com", "admin");
  const page = await context.newPage();
  for (const id of ["not-a-uuid", "11111111-1111-4111-8111-111111111111"]) {
    await page.goto(`/admin/users/${id}`);
    await expect(page.getByRole("heading", { name: "User unavailable" })).toBeVisible();
    await expect(page.getByText("mara.vale@example.test")).toHaveCount(0);
  }
  await context.close();
});
