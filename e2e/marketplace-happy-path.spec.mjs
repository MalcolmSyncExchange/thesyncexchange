import fs from "node:fs";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const sharedPassword = process.env.QA_TEST_ACCOUNT_PASSWORD || "";
const accounts = {
  artist: {
    email: process.env.E2E_ARTIST_EMAIL || process.env.QA_ARTIST_EMAIL || "",
    password: process.env.E2E_ARTIST_PASSWORD || sharedPassword
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "",
    password: process.env.E2E_ADMIN_PASSWORD || sharedPassword
  },
  buyer: {
    email: process.env.E2E_BUYER_EMAIL || process.env.QA_BUYER_EMAIL || "",
    password: process.env.E2E_BUYER_PASSWORD || sharedPassword
  },
  wrongBuyer: {
    email: process.env.E2E_WRONG_BUYER_EMAIL || process.env.QA_WRONG_BUYER_EMAIL || "",
    password: process.env.E2E_WRONG_BUYER_PASSWORD || sharedPassword
  }
};

const fixtures = {
  coverArt: process.env.E2E_COVER_ART_PATH || "",
  audio: process.env.E2E_AUDIO_PATH || "",
  preview: process.env.E2E_PREVIEW_AUDIO_PATH || ""
};

test.describe.serial("marketplace happy path", () => {
  test("artist submits, admin approves, buyer purchases, and agreement access stays role-gated", async ({ browser }) => {
    const missing = collectMissingRequirements();
    test.skip(missing.length > 0, `Missing E2E prerequisites: ${missing.join(", ")}`);

    const trackTitle = `E2E Launch Track ${Date.now()}`;

    const artistContext = await browser.newContext({ baseURL });
    const artistPage = await signIn(artistContext, accounts.artist);
    await artistPage.goto("/artist/submit");
    await expect(artistPage.getByTestId("track-submit-form")).toBeVisible();
    await artistPage.getByTestId("track-title-input").fill(trackTitle);
    await artistPage.getByLabel("Description").fill("Playwright launch-readiness track submission for The Sync Exchange.");
    await artistPage.getByTestId("track-cover-art-input").setInputFiles(fixtures.coverArt);
    await artistPage.getByTestId("track-audio-input").setInputFiles(fixtures.audio);
    await artistPage.getByTestId("track-preview-input").setInputFiles(fixtures.preview);
    await artistPage.getByTestId("track-publish-submit").click();
    await expect(artistPage.getByText("Track submitted for review.")).toBeVisible({ timeout: 60_000 });

    const adminContext = await browser.newContext({ baseURL });
    const adminPage = await signIn(adminContext, accounts.admin);
    await adminPage.goto("/admin/review-queue");
    const reviewCard = adminPage.locator("article").filter({ hasText: trackTitle }).first();
    await expect(reviewCard).toBeVisible({ timeout: 60_000 });
    await reviewCard.getByTestId(/approve-track-/).click();

    const buyerContext = await browser.newContext({ baseURL });
    const buyerPage = await signIn(buyerContext, accounts.buyer);
    await expect
      .poll(
        async () => {
          await buyerPage.goto("/buyer/catalog");
          return buyerPage.getByRole("link", { name: trackTitle }).count();
        },
        { timeout: 90_000, intervals: [1_500, 3_000, 5_000] }
      )
      .toBeGreaterThan(0);

    await buyerPage.goto("/buyer/catalog");
    await buyerPage.getByRole("link", { name: trackTitle }).first().click();
    await buyerPage.getByTestId("license-track-button").click();
    await expect(buyerPage.getByTestId("buyer-checkout-form")).toBeVisible();
    await buyerPage.getByTestId("buyer-checkout-submit").click();

    await completeStripeCheckout(buyerPage, accounts.buyer.email);
    await buyerPage.waitForURL(/\/license-confirmation\/[^/?]+/, { timeout: 120_000 });
    await expect(buyerPage.getByText("License confirmation")).toBeVisible();

    const orderId = buyerPage.url().match(/license-confirmation\/([^/?]+)/)?.[1];
    expect(orderId, "order id should be present in the confirmation URL").toBeTruthy();

    await expect
      .poll(
        async () => {
          await buyerPage.goto(`/license-confirmation/${orderId}`);
          if (await buyerPage.getByText(/agreement generation still needs attention/i).count()) {
            return "generation-error";
          }

          if (await buyerPage.getByRole("link", { name: /open agreement document/i }).count()) {
            return "ready";
          }

          return "pending";
        },
        { timeout: 120_000, intervals: [2_000, 4_000, 6_000] }
      )
      .toBe("ready");

    const wrongBuyerContext = await browser.newContext({ baseURL });
    await signIn(wrongBuyerContext, accounts.wrongBuyer);

    const unauthenticatedResponse = await browser
      .newContext({ baseURL })
      .then((context) => context.request.get(`/api/orders/${orderId}/agreement`, { maxRedirects: 0 }));
    expect(unauthenticatedResponse.status()).toBe(401);

    const wrongBuyerResponse = await wrongBuyerContext.request.get(`/api/orders/${orderId}/agreement`, { maxRedirects: 0 });
    expect(wrongBuyerResponse.status()).toBe(403);

    const buyerAgreementResponse = await buyerContext.request.get(`/api/orders/${orderId}/agreement`, { maxRedirects: 0 });
    expect([200, 307]).toContain(buyerAgreementResponse.status());

    const adminAgreementResponse = await adminContext.request.get(`/api/orders/${orderId}/agreement`, { maxRedirects: 0 });
    expect([200, 307]).toContain(adminAgreementResponse.status());

    await adminPage.goto("/admin/orders");
    await expect(adminPage.getByText(orderId)).toBeVisible({ timeout: 60_000 });
  });
});

async function signIn(context, credentials) {
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/(artist|buyer|admin|onboarding)/, { timeout: 60_000 });
  return page;
}

async function completeStripeCheckout(page, email) {
  await page.waitForURL(/stripe\.com|\/pay\//, { timeout: 120_000 });

  const emailField = page.locator('input[type="email"]').first();
  if ((await emailField.count()) > 0 && (await emailField.isVisible().catch(() => false))) {
    await emailField.fill(email);
  }

  await fillStripeInput(page, ["input[name='cardNumber']", "input[name='cardnumber']", "input[autocomplete='cc-number']"], "4242424242424242");
  await fillStripeInput(page, ["input[name='cardExpiry']", "input[name='exp-date']", "input[autocomplete='cc-exp']"], "1234");
  await fillStripeInput(page, ["input[name='cardCvc']", "input[name='cvc']", "input[autocomplete='cc-csc']"], "123");

  const payButton = page.getByRole("button", { name: /pay|purchase/i }).first();
  await expect(payButton).toBeVisible({ timeout: 30_000 });
  await payButton.click();
}

async function fillStripeInput(page, selectors, value) {
  for (const selector of selectors) {
    const pageLocator = page.locator(selector).first();
    if ((await pageLocator.count()) > 0 && (await pageLocator.isVisible().catch(() => false))) {
      await pageLocator.fill(value);
      return;
    }
  }

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        await locator.fill(value);
        return;
      }
    }
  }

  throw new Error(`Unable to find Stripe field for selectors: ${selectors.join(", ")}`);
}

function collectMissingRequirements() {
  const missing = [];

  for (const [role, credentials] of Object.entries(accounts)) {
    if (!credentials.email) {
      missing.push(`${role} email`);
    }
    if (!credentials.password) {
      missing.push(`${role} password`);
    }
  }

  for (const [label, filePath] of Object.entries(fixtures)) {
    if (!filePath) {
      missing.push(`${label} fixture path`);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      missing.push(`${label} fixture missing at ${filePath}`);
    }
  }

  return missing;
}
