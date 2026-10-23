import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import Stripe from "stripe";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;
const defaultFixturePaths = {
  coverArt: path.join(rootDir, "tests/fixtures/cover-art.png"),
  audio: path.join(rootDir, "tests/fixtures/full-track.wav"),
  preview: path.join(rootDir, "tests/fixtures/preview-track.wav")
};
const sharedPassword = process.env.QA_TEST_ACCOUNT_PASSWORD || "";
const accounts = {
  artist: {
    email: process.env.E2E_ARTIST_EMAIL || process.env.QA_ARTIST_EMAIL || "qa-artist@thesyncexchange.com",
    password: process.env.E2E_ARTIST_PASSWORD || sharedPassword
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "qa-admin@thesyncexchange.com",
    password: process.env.E2E_ADMIN_PASSWORD || sharedPassword
  },
  buyer: {
    email: process.env.E2E_BUYER_EMAIL || process.env.QA_BUYER_EMAIL || "qa-buyer@thesyncexchange.com",
    password: process.env.E2E_BUYER_PASSWORD || sharedPassword
  },
  wrongBuyer: {
    email: process.env.E2E_WRONG_BUYER_EMAIL || process.env.QA_WRONG_BUYER_EMAIL || "qa-buyer-two@thesyncexchange.com",
    password: process.env.E2E_WRONG_BUYER_PASSWORD || sharedPassword
  }
};

const fixtures = {
  coverArt: process.env.E2E_COVER_ART_PATH || defaultFixturePaths.coverArt,
  audio: process.env.E2E_AUDIO_PATH || defaultFixturePaths.audio,
  preview: process.env.E2E_PREVIEW_AUDIO_PATH || defaultFixturePaths.preview
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
    await artistPage.getByTestId("track-subgenre-input").fill("Synthwave");
    await artistPage.getByTestId("track-moods-input").fill("Driving, Bright, Confident");
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
          return buyerPage.getByTestId("catalog-track-card").filter({ hasText: trackTitle }).count();
        },
        { timeout: 90_000, intervals: [1_500, 3_000, 5_000] }
      )
      .toBeGreaterThan(0);

    await buyerPage.goto("/buyer/catalog");
    await buyerPage.getByTestId("catalog-track-card").filter({ has: buyerPage.getByRole("heading", { name: trackTitle, exact: true }) })
      .getByRole("link", { name: trackTitle, exact: true }).click();
    const expectedOffer = await loadExpectedOffer(trackTitle, accounts.buyer.email);
    const payment = await selectLicenseAndReview(buyerPage, expectedOffer, async () => {
      const { data, error } = await supabaseAdmin.from("orders")
        .select("id, stripe_checkout_session_id").eq("track_id", expectedOffer.trackId);
      expect(error).toBeNull();
      expect(data, "Selection and review must not create an order or bind a Stripe session").toEqual([]);
    });
    await expect(payment).toBeEnabled();
    await payment.click();

    await buyerPage.waitForURL(/stripe\.com|\/pay\//, { timeout: 120_000 });
    const order = await waitForLatestOrder({
      trackTitle,
      buyerEmail: accounts.buyer.email
    });
    expect(order.buyer_user_id).toBe(expectedOffer.buyerId);
    expect(order.track_id).toBe(expectedOffer.trackId);
    expect(order.license_type_id).toBe(expectedOffer.licenseTypeId);
    expect(order.amount_cents).toBe(expectedOffer.amountCents);
    expect(order.currency.toUpperCase()).toBe("USD");

    await triggerPaidCheckoutWebhook(order);
    const buyerReturnContext = await browser.newContext({ baseURL });
    const buyerReturnPage = await signIn(buyerReturnContext, accounts.buyer);
    await buyerReturnPage.goto(`/license-confirmation/${order.id}`);
    await expect(buyerReturnPage.getByText("License confirmation")).toBeVisible();

    await expect
      .poll(
        async () => {
          await buyerReturnPage.goto(`/license-confirmation/${order.id}`);
          if (await buyerReturnPage.getByText(/agreement generation still needs attention/i).count()) {
            return "generation-error";
          }

          if (await buyerReturnPage.getByRole("link", { name: /download license agreement/i }).count()) {
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
      .then((context) => context.request.get(`/api/orders/${order.id}/agreement`, { maxRedirects: 0 }));
    expect(unauthenticatedResponse.status()).toBe(401);

    const wrongBuyerResponse = await wrongBuyerContext.request.get(`/api/orders/${order.id}/agreement`, { maxRedirects: 0 });
    expect(wrongBuyerResponse.status()).toBe(403);

    const buyerAgreementResponse = await buyerReturnContext.request.get(`/api/orders/${order.id}/agreement`, { maxRedirects: 0 });
    expect([200, 307]).toContain(buyerAgreementResponse.status());

    const adminAgreementResponse = await adminContext.request.get(`/api/orders/${order.id}/agreement`, { maxRedirects: 0 });
    expect([200, 307]).toContain(adminAgreementResponse.status());

    await adminPage.goto("/admin/orders");
    await expect(adminPage.getByText(order.id)).toBeVisible({ timeout: 60_000 });
  });
});

test("local buyer explicitly selects an offer and reaches read-only review without payment", async ({ page, context }) => {
  test.skip(baseURL !== "http://127.0.0.1:3106" || process.env.SYNC_EXCHANGE_DEMO_MODE !== "true"
    || process.env.ANALYTICS_ENABLED !== "false" || Boolean(supabaseAdmin), "Credential-free isolated demo required");
  await context.addCookies([{
    name: "sync-exchange-session",
    value: JSON.stringify({ id: "buyer-1", email: "music@northframe.co", role: "buyer", fullName: "Elena Park", onboardingComplete: true }),
    url: baseURL
  }]);
  const writes = [];
  page.on("request", request => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(new URL(request.url()).pathname);
  });
  await page.goto("/buyer/catalog");
  const card = page.getByTestId("catalog-track-card").filter({ has: page.getByRole("heading", { name: "Midnight Run", exact: true }) });
  await card.getByRole("link", { name: "Midnight Run", exact: true }).click();
  const payment = await selectLicenseAndReview(page, {
    trackTitle: "Midnight Run", trackId: "track-1", licenseTypeId: "lt-2", licenseName: "Broadcast", priceLabel: "$4,800.00 USD"
  }, async () => expect(writes, "No commerce mutation or analytics request before payment").toEqual([]));
  await expect(payment).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Payment is temporarily unavailable" })).toBeVisible();
});

async function selectLicenseAndReview(page, offer, assertNoCommerce) {
  await expect(page.getByRole("heading", { level: 1, name: offer.trackTitle, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Select License", exact: true }).click();
  const licenses = page.getByRole("group", { name: "Available licenses" });
  await expect(licenses).toBeVisible();
  await expect(licenses.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to Checkout", exact: true })).toBeDisabled();
  await assertNoCommerce();

  const radio = licenses.getByRole("radio", { name: `${offer.licenseName} ${offer.priceLabel}`, exact: true });
  await expect(radio).toHaveValue(offer.licenseTypeId);
  await radio.check();
  await expect(licenses.getByRole("radio", { checked: true })).toHaveValue(offer.licenseTypeId);
  await expect(page).toHaveURL(url => url.searchParams.get("licenseTypeId") === offer.licenseTypeId && url.hash === "#licenses");
  await assertNoCommerce();
  await page.getByRole("link", { name: "Continue to Checkout", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Review your license" })).toBeVisible();
  await expect(page.locator("main").getByText(offer.trackTitle, { exact: true })).toBeVisible();
  const review = page.getByRole("region", { name: offer.licenseName, exact: true });
  await expect(review.getByText(offer.priceLabel, { exact: true })).toBeVisible();
  await expect(review.getByRole("radio")).toHaveCount(0);
  const form = page.getByTestId("buyer-checkout-form");
  await expect(form.locator('input[name="trackId"]')).toHaveValue(offer.trackId);
  await expect(form.locator('input[name="licenseTypeId"]')).toHaveValue(offer.licenseTypeId);
  const confirmation = review.getByRole("checkbox", { name: "I have reviewed this license and its current price." });
  const payment = review.getByRole("button", { name: /^Continue to (Test )?Payment$/ });
  await expect(confirmation).not.toBeChecked();
  await expect(payment).toBeDisabled();
  await assertNoCommerce();
  await confirmation.check();
  await expect(confirmation).toBeChecked();
  await assertNoCommerce();
  return payment;
}

async function loadExpectedOffer(trackTitle, buyerEmail) {
  const [buyer, track, license] = await Promise.all([
    supabaseAdmin.from("user_profiles").select("id, role").eq("email", buyerEmail).single(),
    supabaseAdmin.from("tracks").select("id, status").eq("title", trackTitle).single(),
    supabaseAdmin.from("license_types").select("id, name, default_price_cents").eq("slug", "digital-campaign").eq("active", true).single()
  ]);
  for (const result of [buyer, track, license]) expect(result.error).toBeNull();
  expect(buyer.data.role).toBe("buyer");
  expect(track.data.status).toBe("approved");
  const option = await supabaseAdmin.from("track_license_options").select("id, price_cents")
    .eq("track_id", track.data.id).eq("license_type_id", license.data.id).eq("active", true).single();
  expect(option.error).toBeNull();
  const amountCents = option.data.price_cents ?? license.data.default_price_cents;
  expect(Number.isSafeInteger(amountCents) && amountCents > 0).toBe(true);
  return {
    buyerId: buyer.data.id, trackId: track.data.id, trackTitle,
    licenseTypeId: license.data.id, licenseName: license.data.name, amountCents,
    priceLabel: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100)} USD`
  };
}

async function signIn(context, credentials) {
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/(artist|buyer|admin|onboarding)/, { timeout: 60_000 });
  return page;
}

async function waitForLatestOrder({ trackTitle, buyerEmail }) {
  expect(supabaseAdmin, "E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.").toBeTruthy();

  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const [buyerProfileResult, trackResult] = await Promise.all([
      supabaseAdmin.from("user_profiles").select("id").eq("email", buyerEmail).maybeSingle(),
      supabaseAdmin.from("tracks").select("id, slug").eq("title", trackTitle).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);

    if (buyerProfileResult.error) {
      throw new Error(`Unable to locate buyer profile for ${buyerEmail}: ${buyerProfileResult.error.message}`);
    }

    if (trackResult.error) {
      throw new Error(`Unable to locate track ${trackTitle}: ${trackResult.error.message}`);
    }

    if (buyerProfileResult.data?.id && trackResult.data?.id) {
      const orderResult = await supabaseAdmin
        .from("orders")
        .select("id, buyer_user_id, track_id, license_type_id, amount_cents, currency, stripe_checkout_session_id, status")
        .eq("buyer_user_id", buyerProfileResult.data.id)
        .eq("track_id", trackResult.data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderResult.error) {
        throw new Error(`Unable to locate buyer order for ${trackTitle}: ${orderResult.error.message}`);
      }

      if (orderResult.data?.id && orderResult.data.stripe_checkout_session_id) {
        return {
          ...orderResult.data,
          buyerEmail,
          trackTitle,
          trackSlug: trackResult.data.slug || "catalog"
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for checkout order for track ${trackTitle}.`);
}

async function triggerPaidCheckoutWebhook(order) {
  expect(stripeWebhookSecret, "E2E requires STRIPE_WEBHOOK_SECRET.").toBeTruthy();

  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: order.stripe_checkout_session_id,
        object: "checkout.session",
        client_reference_id: order.id,
        metadata: {
          orderId: order.id,
          buyerUserId: order.buyer_user_id,
          trackId: order.track_id,
          licenseTypeId: order.license_type_id || "",
          trackSlug: order.trackSlug,
          source: "playwright-e2e"
        },
        customer_email: order.buyerEmail,
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        payment_intent: `pi_e2e_${Date.now()}`,
        created: Math.floor(Date.now() / 1000)
      }
    }
  });

  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: stripeWebhookSecret
  });

  const response = await fetch(`${baseURL}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Webhook trigger failed with ${response.status}: ${await response.text()}`);
  }
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

  if (!supabaseAdmin) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!stripeWebhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }

  return missing;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
