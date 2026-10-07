import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPurchaseFixture,
  removePurchaseFixture,
} from "../tests/helpers/purchase-ui-fixture.mjs";
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const output = "/private/tmp/sync-slice2-evidence";
const fixtures = process.env.E2E_PURCHASE_FIXTURES === "true";
test.beforeAll(async () => {
  await fs.mkdir(output, { recursive: true });
  if (fixtures) await createPurchaseFixture();
});
test.afterAll(async () => {
  if (fixtures) await removePurchaseFixture();
});
async function buyer(context) {
  await context.addCookies([
    {
      name: "sync-exchange-session",
      value: JSON.stringify({
        id: "buyer-1",
        email: "buyer@sync.exchange",
        role: "buyer",
        fullName: "Buyer",
        onboardingComplete: true,
      }),
      url: baseURL,
    },
  ]);
}
async function overflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
}
for (const width of [1440, 1024, 390, 320])
  for (const theme of ["dark", "light"])
    test(`purchase workspace ${width} ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
      });
      await context.addInitScript(
        (t) => localStorage.setItem("theme", t),
        theme,
      );
      await buyer(context);
      const page = await context.newPage();
      await page.goto("/buyer/orders");
      await expect(
        page.getByRole("heading", { name: "My Purchases", exact: true }),
      ).toBeVisible();
      await overflow(page);
      await page.screenshot({
        path: path.join(output, `purchases-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.goto("/buyer/orders/ord-1");
      await expect(
        page.getByRole("heading", { name: "Purchase details" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Download Receipt" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "View Agreement" }),
      ).toBeDisabled();
      await overflow(page);
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const audit = await page.evaluate(
        async () =>
          await window.axe.run("[data-purchase-workspace]", {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      );
      await fs.writeFile(
        path.join(output, `axe-${width}-${theme}.json`),
        JSON.stringify(audit, null, 2),
      );
      expect(audit.violations).toEqual([]);
      await page.screenshot({
        path: path.join(output, `detail-${width}-${theme}.png`),
        fullPage: true,
      });
      const buttons = await page
        .getByRole("button", { name: "Unavailable", exact: true })
        .all();
      expect(buttons.length).toBe(6);
      for (const button of buttons) {
        expect(await button.isDisabled()).toBeTruthy();
        const box = await button.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      if (fixtures) {
        for (const state of [
          "ready",
          "processing",
          "refunded",
          "partial-refund",
          "hold",
          "disputed",
          "loading",
          "error",
        ]) {
          await page.goto(`/buyer/purchase-fixture-local?state=${state}`);
          if (state === "loading")
            await expect(
              page.getByRole("status", { name: "Loading purchases" }),
            ).toBeVisible();
          else if (state === "error")
            await expect(page.locator("section[role=alert]")).toBeVisible();
          else
            await expect(
              page.getByRole("heading", { name: "Purchase details" }),
            ).toBeVisible();
          await overflow(page);
          await page.screenshot({
            path: path.join(output, `fixture-${state}-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
      if (fixtures) {
        for (const state of ["empty", "filtered-empty"]) {
          await page.goto(
            `/buyer/purchase-fixture-local?state=${state}&view=list`,
          );
          await expect(
            page.getByRole("heading", {
              name:
                state === "empty"
                  ? "No purchases yet"
                  : "No purchases match this view",
            }),
          ).toBeVisible();
          await overflow(page);
          await page.screenshot({
            path: path.join(output, `fixture-${state}-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
      await context.close();
    });
test("owned detail, cross-Buyer denial, filtered empty and keyboard focus", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await buyer(context);
  const page = await context.newPage();
  await page.goto("/buyer/orders/ord-2");
  await expect(
    page.getByRole("heading", { name: "Purchase details" }),
  ).toHaveCount(0);
  await page.goto("/buyer/orders?query=no-such-order");
  await expect(
    page.getByRole("heading", { name: "No purchases match this view" }),
  ).toBeVisible();
  await page.goto("/buyer/orders");
  await page
    .getByRole("textbox", { name: "Search by exact order reference" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Payment filter")).toBeFocused();
  await context.close();
});

test("reduced-motion loading and existing player coexistence", async ({
  browser,
}) => {
  test.skip(!fixtures, "Explicit localhost-only fixtures required");
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    reducedMotion: "reduce",
  });
  await buyer(context);
  const page = await context.newPage();
  await page.goto("/buyer/purchase-fixture-local?state=loading");
  await expect(
    page.getByRole("status", { name: "Loading purchases" }),
  ).toBeVisible();
  expect(
    await page
      .locator("[role=status]>div")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.goto("/buyer/purchase-fixture-local");
  await page
    .getByRole("button", { name: "Start local preview fixture" })
    .click();
  await expect(
    page.getByRole("region", { name: "Buyer preview player" }),
  ).toBeVisible();
  await overflow(page);
  await page
    .getByRole("link", { name: "Contact support" })
    .scrollIntoViewIfNeeded();
  const contact = await page
      .getByRole("link", { name: "Contact support" })
      .boundingBox(),
    player = await page
      .getByRole("region", { name: "Buyer preview player" })
      .boundingBox();
  expect(contact.y + contact.height).toBeLessThanOrEqual(player.y);
  await page.screenshot({
    path: path.join(output, "detail-player-320.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to purchases" }).click();
  await expect(
    page.getByRole("heading", { name: "My Purchases", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Buyer preview player" }),
  ).toBeVisible();
  await overflow(page);
  await context.close();
});
