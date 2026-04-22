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
    await buyerPage.getByTestId("catalog-track-card").filter({ hasText: trackTitle }).first().getByRole("link", { name: "View Track" }).click();
    await buyerPage.getByTestId("license-track-button").click();
    await expect(buyerPage.getByTestId("buyer-checkout-form")).toBeVisible();
    await buyerPage.getByTestId("buyer-checkout-submit").click();

    await buyerPage.waitForURL(/stripe\.com|\/pay\//, { timeout: 120_000 });
    const order = await waitForLatestOrder({
      trackTitle,
      buyerEmail: accounts.buyer.email
    });

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

          if (await buyerReturnPage.getByRole("link", { name: /open agreement document/i }).count()) {
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
