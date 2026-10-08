import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { presentPurchase, REFUND_BANNER } from "../lib/purchases/contract.ts";
import {
  parsePurchaseOptions,
  purchaseCursor,
  ORDER_UUID,
} from "../lib/purchases/pagination.ts";
import { agreementHarness } from "./helpers/agreement-access-harness.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const base = {
  id,
  buyer_user_id: "buyer-a",
  track_id: "track-a",
  license_type_id: "license-a",
  status: "fulfilled",
  created_at: "2026-10-01T00:00:00.000Z",
  paid_at: "2026-10-02T00:00:00.000Z",
  amount_cents: 14900,
  currency: "USD",
};
const license = (overrides = {}) => ({
  order_id: id,
  buyer_id: "buyer-a",
  track_id: "track-a",
  license_type_id: "license-a",
  status: "generated",
  generated_at: "2026-10-02T00:00:00.000Z",
  pdf_storage_path: "private-secret-path",
  agreement_number: "AGREEMENT-1",
  terms_snapshot_json: {
    orderId: id,
    buyer: { userId: "buyer-a", email: "private@email.test" },
    track: {
      id: "track-a",
      title: "Frozen title",
      artistName: "Frozen artist",
      rightsHolders: [{ name: "PRIVATE-HOLDER" }],
    },
    license: {
      typeId: "license-a",
      typeName: "Frozen license",
      pricePaidCents: 14900,
      currency: "USD",
      termLength: "Test only",
      territory: "Test only",
      permittedMedia: ["No commercial rights"],
    },
    payment: {
      paymentMode: "test",
      livemode: false,
      commercialRightsGranted: false,
    },
    stripe: { paymentIntentId: "pi_private" },
    templateVersion: "v1",
  },
  ...overrides,
});
function harness({
  role = "buyer",
  user = { id: "buyer-a", user_metadata: { role: "admin" } },
  rows = [base],
  licenseRows = [license()],
  privilegedRows,
  scopeError = false,
} = {}) {
  const state = { privileged: 0, operations: [], limits: [] };
  function client(privileged = false) {
    return {
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from(table) {
        state.operations.push({ table, privileged });
        let values =
          table === "orders"
            ? privileged
              ? privilegedRows || rows
              : rows
            : table === "generated_licenses"
              ? licenseRows
              : table === "tracks"
                ? [
                    {
                      id: "track-a",
                      title: "Current title",
                      artist_user_id: "artist-a",
                      cover_art_path: null,
                    },
                  ]
                : table === "artist_profiles"
                  ? [{ user_id: "artist-a", artist_name: "Current artist" }]
                  : [{ id: "license-a", name: "Current license" }];
        const q = {
          select(fields) {
            assert.notEqual(fields, "*");
            return q;
          },
          eq(key, value) {
            values = values.filter((v) => v[key] === value);
            return q;
          },
          in(key, items) {
            values = values.filter((v) => items.includes(v[key]));
            return q;
          },
          order() {
            values = [...values].sort(
              (a, b) =>
                (b.created_at || "").localeCompare(a.created_at || "") ||
                b.id.localeCompare(a.id),
            );
            return q;
          },
          limit(n) {
            state.limits.push(n);
            values = values.slice(0, n);
            return q;
          },
          or(expression) {
            const parts =
              /created_at.lt.([^,]+),and\(created_at.eq.([^,]+),id.lt.([^\)]+)\)/.exec(
                expression,
              );
            assert.ok(parts);
            values = values.filter(
              (v) =>
                v.created_at < parts[1] ||
                (v.created_at === parts[2] && v.id < parts[3]),
            );
            return q;
          },
          maybeSingle: async () => ({
            data: values[0] || null,
            error: scopeError ? {} : null,
          }),
          then(resolve, reject) {
            return Promise.resolve({
              data: values,
              error: scopeError && !privileged ? {} : null,
            }).then(resolve, reject);
          },
        };
        return q;
      },
    };
  }
  const modules = {
    "server-only": {},
    "@/lib/purchases/contract": { presentPurchase },
    "@/lib/purchases/pagination": {
      ORDER_UUID,
      parsePurchaseOptions,
      purchaseCursor,
    },
    "@/lib/env": { shouldUseDemoData: () => false },
    "@/lib/demo-data": {},
    "@/lib/storage": {
      getPublicStorageUrl: () => null,
      storageBuckets: { coverArt: "cover-art" },
    },
    "@/services/auth/session": {},
    "@/services/auth/user-profiles": {
      selectUserProfileCompat: async () => ({ data: { role }, error: null }),
    },
    "@/services/supabase/server": {
      createServerSupabaseClient: async () => client(),
    },
    "@/services/supabase/privileged": {
      createPrivilegedSupabaseClient: async () => {
        state.privileged++;
        return client(true);
      },
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL("../services/buyer/purchases.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      Buffer,
      require(name) {
        assert.ok(name in modules, name);
        return modules[name];
      },
    },
  );
  return { api: loaded.exports, state };
}
test("Buyer A can read own purchase; privileged access follows scoped authenticated query", async () => {
  const { api, state } = harness();
  assert.equal((await api.getBuyerPurchase(id)).title, "Frozen title");
  assert.equal(state.operations[0].privileged, false);
  assert.equal(state.operations[0].table, "orders");
  assert.equal(state.privileged, 1);
});
for (const role of ["artist", "admin", null])
  test(`${role} is not authorized as Buyer, including spoofed metadata`, async () => {
    const { api, state } = harness({
      role,
      user: {
        id: "buyer-a",
        user_metadata: { role: "buyer" },
        app_metadata: { role: "buyer" },
      },
    });
    await assert.rejects(api.getBuyerPurchase(id));
    await assert.rejects(api.getBuyerPurchasePage());
    assert.equal(state.privileged, 0);
    assert.equal(state.operations.length, 0);
  });
test("anonymous access denied before purchase queries", async () => {
  const { api, state } = harness({ user: null });
  await assert.rejects(api.getBuyerPurchase(id));
  await assert.rejects(api.getBuyerPurchasePage());
  assert.equal(state.privileged, 0);
});
test("cross-Buyer, nonexistent and malformed detail do not disclose or acquire privileged client", async () => {
  for (const order of [
    id,
    "22222222-2222-4222-8222-222222222222",
    "malformed",
  ]) {
    const { api, state } = harness({
      rows: [{ ...base, buyer_user_id: "buyer-b" }],
    });
    assert.equal(await api.getBuyerPurchase(order), null);
    assert.equal(state.privileged, 0);
  }
});
test("cross-Buyer list returns no purchases", async () => {
  const { api, state } = harness({
    rows: [{ ...base, buyer_user_id: "buyer-b" }],
  });
  assert.equal((await api.getBuyerPurchasePage()).items.length, 0);
  assert.equal(state.privileged, 0);
});
test("privileged relationship substitution fails closed", async () => {
  const { api } = harness({
    privilegedRows: [{ ...base, track_id: "forged" }],
  });
  await assert.rejects(api.getBuyerPurchase(id));
});
test("forged license relationship is ignored", () => {
  const p = presentPurchase(base, license({ buyer_id: "buyer-b" }));
  assert.equal(p.agreement.canDownload, false);
  assert.equal(p.terms, null);
  assert.equal(p.title, "Track unavailable");
});
test("private snapshot values, provider IDs, paths, emails, hashes and raw errors never serialize", () => {
  const p = presentPurchase(
    {
      ...base,
      provider_id: "PRIVATE_PROVIDER",
      metadata: { secret: "SECRET" },
      agreement_generation_error: "PRIVATE_ERROR",
    },
    license(),
  );
  const output = JSON.stringify(p);
  for (const value of [
    "PRIVATE_PROVIDER",
    "SECRET",
    "PRIVATE_ERROR",
    "PRIVATE-HOLDER",
    "pi_private",
    "private-secret-path",
    "private@email.test",
    "terms_snapshot_json",
    "pdf_storage_path",
    "buyer_user_id",
  ])
    assert.equal(output.includes(value), false, value);
});
test("payment, license, agreement, receipt, files and hold are independent", () => {
  const p = presentPurchase(base, license());
  assert.equal(p.payment.code, "paid");
  assert.equal(p.agreement.canDownload, true);
  assert.equal(p.receipt.code, "unavailable");
  assert.equal(p.files.code, "unavailable");
  assert.equal(p.hold.evidence, "unknown");
  assert.equal(p.summary.code, "partial");
  assert.equal(p.paymentMode, "test");
  assert.match(p.license.detail, /no commercial rights/i);
});
test("full refund retains historical agreement without license validity/revocation inference", () => {
  const p = presentPurchase({ ...base, status: "refunded" }, license());
  assert.equal(p.payment.label, "Refunded");
  assert.equal(p.agreement.label, "Issued agreement · Historical copy");
  assert.equal(p.agreement.canDownload, true);
  assert.equal(p.license.code, "issued");
  assert.equal(p.files.code, "unavailable");
  assert.match(REFUND_BANNER, /Refund status alone does not determine/);
});
test("missing snapshot never substitutes current catalog terms or classifies live rights", () => {
  const p = presentPurchase(base, license({ terms_snapshot_json: {} }), {
    title: "Current title",
    licenseName: "Current label",
  });
  assert.equal(p.terms, null);
  assert.equal(p.identitySource, "current_catalog");
  assert.equal(p.paymentMode, "unknown");
});
test("invalid/missing amount stays unavailable rather than a fake zero", () => {
  assert.equal(
    presentPurchase({ ...base, amount_cents: null }, null).amountMinor,
    null,
  );
});
test("pending payment cannot authorize a generated agreement", () => {
  const p = presentPurchase(
    { ...base, status: "pending", paid_at: null },
    license(),
  );
  assert.equal(p.payment.code, "pending");
  assert.equal(p.agreement.canDownload, false);
});
test("pagination is bounded, stable across equal timestamps and uses authenticated scope", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    ...base,
    id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
  }));
  const { api, state } = harness({ rows, licenseRows: [] });
  const first = await api.getBuyerPurchasePage();
  assert.equal(first.items.length, 25);
  assert.equal(state.limits[0], 26);
  const second = await api.getBuyerPurchasePage({ cursor: first.nextCursor });
  assert.equal(second.items.length, 25);
  assert.equal(
    new Set([...first.items, ...second.items].map((p) => p.id)).size,
    50,
  );
  assert.ok(first.items[24].id > second.items[0].id);
  assert.equal(parsePurchaseOptions({ size: "500" }).pageSize, 50);
});
test("cursor injection and invalid dates rejected", () => {
  for (const createdAt of [
    "2026-10-01,or(status.eq.paid)",
    "invalid",
    "2026-10-01",
  ])
    assert.throws(() =>
      parsePurchaseOptions({
        cursor: Buffer.from(JSON.stringify({ id, createdAt })).toString(
          "base64url",
        ),
      }),
    );
});
test("search/filter executes bounded server query, invalid reference never loads history", async () => {
  const { api, state } = harness();
  assert.equal(
    (await api.getBuyerPurchasePage({ query: id, filter: "paid" })).items
      .length,
    1,
  );
  const before = state.operations.length;
  assert.equal(
    (await api.getBuyerPurchasePage({ query: "unknown" })).items.length,
    0,
  );
  assert.equal(state.operations.length, before);
  assert.equal(
    (await api.getBuyerPurchasePage({ filter: "refunded" })).items.length,
    0,
  );
});
test("purchase renders/readiness GET/HEAD never audit or mutate licenses; explicit POST unchanged", async () => {
  const { api } = harness();
  await api.getBuyerPurchase(id);
  await api.getBuyerPurchasePage();
  const h = agreementHarness();
  for (const method of ["GET", "HEAD", "GET"])
    await h.request(method, { RSC: "1", "Next-Router-Prefetch": "1" });
  assert.equal(h.state.audits.length, 0);
  assert.equal(h.state.licenseWrites, 0);
  assert.equal(
    (await h.request("POST", { origin: "https://app.example" })).status,
    303,
  );
  assert.equal(h.state.audits.length, 1);
  assert.equal(h.state.licenseWrites, 0);
});
test("existing canonical Admin agreement authorization remains supported", async () => {
  const h = agreementHarness({ role: "admin" });
  assert.equal(
    (await h.request("POST", { origin: "https://app.example" })).status,
    303,
  );
});
test("UI uses POST form and disabled receipt/files with no new delivery or commerce side effects", () => {
  const ui = fs.readFileSync(
    "components/orders/purchase-workspace.tsx",
    "utf8",
  );
  const loader = fs.readFileSync("services/buyer/purchases.ts", "utf8");
  assert.match(ui, /<AgreementDownloadForm/);
  assert.match(ui, /disabled\s+aria-describedby="receipt-reason"/);
  assert.doesNotMatch(
    loader,
    /\.rpc\(|\.insert\(|\.update\(|\.delete\(|createSignedUrl|record_payment|prepare_purchase/,
  );
  assert.doesNotMatch(
    ui,
    /track-audio|purchase-assets|stripe_checkout_session_id|terms_snapshot_json/,
  );
});

test("pagination preserves PostgREST microseconds and database ordering across every page", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE purchases(id uuid PRIMARY KEY, buyer text, created_at timestamptz NOT NULL);",
    );
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      at:
        i >= 6
          ? "2026-10-01T12:00:00.123456+00:00"
          : "2026-10-01T12:00:00.123400+00:00",
    }));
    for (const r of rows)
      await db.query("INSERT INTO purchases VALUES ($1,$2,$3)", [
        r.id,
        "buyer-a",
        r.at,
      ]);
    await db.query("INSERT INTO purchases VALUES ($1,$2,$3)", [
      id,
      "buyer-b",
      "2026-10-01T12:00:00.123455+00:00",
    ]);
    const expected = (
      await db.query(
        "SELECT id FROM purchases WHERE buyer='buyer-a' ORDER BY created_at DESC,id DESC",
      )
    ).rows.map((r) => r.id);
    for (const size of [1, 2, 4]) {
      const seen = [];
      let cursor = null;
      for (let page = 0; page < 12; page++) {
        // PostgreSQL JSON timestamp text is the precision-preserving PostgREST representation.
        const result = await db.query(
          "SELECT id,to_json(created_at)#>>'{}' AS created_at FROM purchases WHERE buyer=$1 AND ($2::timestamptz IS NULL OR created_at<$2::timestamptz OR (created_at=$2::timestamptz AND id<$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4",
          ["buyer-a", cursor?.createdAt || null, cursor?.id || null, size],
        );
        if (!result.rows.length) break;
        seen.push(...result.rows.map((r) => r.id));
        const last = result.rows.at(-1);
        cursor = parsePurchaseOptions({ cursor: purchaseCursor(last) }).cursor;
        assert.equal(cursor.createdAt, last.created_at);
        assert.match(cursor.createdAt, /\.123(?:456|4)(?:\+00:00|Z)$/);
      }
      assert.deepEqual(seen, expected);
      assert.equal(new Set(seen).size, rows.length);
    }
  } finally {
    await db.close();
  }
});

test("cursor rejects impossible calendars, offsets, types and query fragments without precision loss", () => {
  for (const createdAt of [
    "2026-02-29T12:00:00.123456Z",
    "2026-04-31T12:00:00Z",
    "2026-10-01T24:00:00Z",
    "2026-10-01T12:60:00Z",
    "2026-10-01T12:00:60Z",
    "2026-10-01T12:00:00.1234567Z",
    "2026-10-01T12:00:00+16:00",
    "2026-10-01T12:00:00+00:60",
    "2026-10-01T12:00:00Z,or(id.neq.x)",
    "2026-10-01T12:00:00Z\n",
    null,
    [],
  ]) {
    assert.throws(() =>
      parsePurchaseOptions({
        cursor: Buffer.from(JSON.stringify({ id, createdAt })).toString(
          "base64url",
        ),
      }),
    );
  }
  for (const createdAt of [
    "2024-02-29T12:00:00.123456Z",
    "2026-10-01T12:00:00.123400+00:00",
    "2026-10-01T12:00:00.1-07:00",
  ]) {
    assert.equal(
      parsePurchaseOptions({
        cursor: purchaseCursor({ id, created_at: createdAt }),
      }).cursor.createdAt,
      createdAt,
    );
  }
  assert.throws(() =>
    parsePurchaseOptions({
      cursor: Buffer.from(
        JSON.stringify({ id: [id], createdAt: base.created_at }),
      ).toString("base64url"),
    }),
  );
  assert.throws(() => parsePurchaseOptions({ cursor: "!!!" }));
  assert.throws(() =>
    parsePurchaseOptions({
      cursor: Buffer.from(
        JSON.stringify({ id: id + "\n", createdAt: base.created_at }),
      ).toString("base64url"),
    }),
  );
});

test("forged future/past cursors remain bounded and owned; filters/search independently intersect the cutoff", async () => {
  const rows = [
    base,
    {
      ...base,
      id: "22222222-2222-4222-8222-222222222222",
      status: "refunded",
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      ...base,
      id: "33333333-3333-4333-8333-333333333333",
      buyer_user_id: "buyer-b",
    },
  ];
  const { api, state } = harness({ rows });
  const future = purchaseCursor({
    id,
    created_at: "2099-01-01T00:00:00.123456Z",
  });
  const past = purchaseCursor({ id, created_at: "1900-01-01T00:00:00Z" });
  assert.equal(
    (await api.getBuyerPurchasePage({ cursor: future, size: "9999" })).items
      .length,
    2,
  );
  assert.equal(
    (await api.getBuyerPurchasePage({ cursor: past })).items.length,
    0,
  );
  assert.ok(state.limits.every((n) => n <= 51));
  const cutoff = purchaseCursor(base);
  const changedFilter = await api.getBuyerPurchasePage({
    cursor: cutoff,
    filter: "refunded",
  });
  assert.deepEqual(
    changedFilter.items.map((p) => p.id),
    [rows[1].id],
  );
  assert.equal(
    (await api.getBuyerPurchasePage({ cursor: cutoff, query: id })).items
      .length,
    0,
  );
  assert.equal((await api.getBuyerPurchasePage({ query: id })).items.length, 1);
  assert.equal(
    (await api.getBuyerPurchasePage({ cursor: future, query: rows[2].id }))
      .items.length,
    0,
  );
});

test("license readiness distinguishes issued, authoritative processing, failure and unavailable evidence", () => {
  for (const [facts, code, label, evidence] of [
    [license(), "issued", "Issued record", "authoritative"],
    [
      license({
        status: "pending",
        generated_at: null,
        pdf_storage_path: null,
      }),
      "pending",
      "Processing",
      "authoritative",
    ],
    [
      license({ status: "failed", generation_error: "PRIVATE_FAILURE" }),
      "failed",
      "Generation failed",
      "authoritative",
    ],
    [null, "unknown", "Unavailable", "unknown"],
    [license({ status: "unrecognized" }), "unknown", "Unavailable", "unknown"],
    [license({ generated_at: "invalid" }), "unknown", "Unavailable", "unknown"],
    [license({ buyer_id: "foreign" }), "unknown", "Unavailable", "unknown"],
    [
      license({ generation_error: "PRIVATE_FAILURE" }),
      "failed",
      "Generation failed",
      "authoritative",
    ],
  ]) {
    // Unclassified terms exercise visible explanations rather than TEST-only explanation.
    const p = presentPurchase(
      base,
      facts && { ...facts, terms_snapshot_json: {} },
    );
    assert.equal(p.license.code, code);
    assert.equal(p.license.label, label);
    assert.equal(p.license.evidence, evidence);
    assert.match(
      p.license.detail,
      code === "issued"
        ? /authoritative issued record/
        : code === "pending"
          ? /generation is processing/
          : code === "failed"
            ? /generation failed/
            : /Processing is not established/,
    );
    assert.ok(!JSON.stringify(p).includes("PRIVATE_FAILURE"));
  }
  const refunded = presentPurchase({ ...base, status: "refunded" }, license());
  assert.equal(refunded.license.label, "Issued record");
  assert.equal(refunded.agreement.label, "Issued agreement · Historical copy");
  assert.match(refunded.license.detail, /no commercial rights/);
  assert.equal(refunded.paymentMode, "test");
});

test("activity records successful issuance only; failed timestamps and hostile events never fabricate history", () => {
  const event = (p) =>
    p.activity.filter((e) => e.label === "Agreement generated");
  assert.equal(event(presentPurchase(base, license())).length, 1);
  for (const facts of [
    null,
    license({ status: "failed", generation_error: "PRIVATE_STACK" }),
    license({ status: "pending" }),
    license({ status: "unknown" }),
    license({ generated_at: "invalid" }),
    license({ generation_error: "PRIVATE_STACK" }),
    license({ buyer_id: "foreign" }),
  ]) {
    const p = presentPurchase(
      {
        ...base,
        order_activity_log: [
          { type: "unknown", metadata: { secret: "HOSTILE_PROVIDER" } },
          { type: "agreement_generated", metadata: { stack: "PRIVATE_STACK" } },
        ],
      },
      facts,
    );
    assert.equal(event(p).length, 0);
    assert.ok(!JSON.stringify(p).includes("HOSTILE_PROVIDER"));
    assert.ok(!JSON.stringify(p).includes("PRIVATE_STACK"));
  }
  // Current persisted state after retry succeeds; no invented attempt history.
  const retried = presentPurchase(
    base,
    license({
      generated_at: "2026-10-03T00:00:00.000Z",
      generation_error: null,
    }),
  );
  assert.deepEqual(event(retried), [
    { label: "Agreement generated", at: "2026-10-03T00:00:00.000Z" },
  ]);
});
