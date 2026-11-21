import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  ids,
  asActor,
  admin,
  payment,
  call,
  randomUUID,
} from "./helpers/accounting-fixture.mjs";
import { bindFounder, command as secCommand } from "./helpers/sec-fixture.mjs";
const start = new Date(Date.now() - 300 * 86400000).toISOString(),
  end = new Date(Date.now() + 86400000).toISOString();
const args = (changes = {}) => {
  const x = {
    start,
    end,
    mode: "test",
    currency: null,
    account: null,
    status: "all",
    source: "all",
    interval: "day",
    page: 1,
    q: "",
    ...changes,
  };
  return Object.values(x);
};
const read = (db, x) => admin(db, "sec_financial_command_center", args(x));
test("executive report uses complete cohorts, exact ledger amounts, real empty states and no payloads", () =>
  fixture(async (db, c) => {
    const r = await read(db);
    assert.equal(r.total, 1);
    const t = r.totals.find((t) => t.period === "current");
    assert.equal(t.gross, "5000");
    assert.equal(t.commission, "1000");
    assert.equal(t.earnings, "4000");
    assert.equal(t.obligations, "4000");
    assert.equal(r.transactions[0].matched, false);
    assert.equal(r.subscriptionsAvailable, false);
    assert.equal(r.payoutsAvailable, false);
    for (const value of [
      "raw_body",
      "snapshot_hash",
      "evidence_sha256",
      "buyer@",
      "signedUrl",
    ])
      assert.equal(JSON.stringify(r).includes(value), false);
    assert.equal((await read(db, { q: c.order })).total, 1);
    assert.equal((await read(db, { q: "not present" })).total, 0);
    assert.equal(
      (await read(db, { q: "not present" })).totals.find(
        (t) => t.period === "current",
      ).gross,
      "5000",
    );
  }));
test("partial and full refunds reverse commissions and artist balances without double counting duplicate observations", () =>
  fixture(async (db, c) => {
    await payment(db, c, "PARTIALLY_REFUNDED", 1000);
    await call(db, "post_financial_order", [c.order]);
    let r = await read(db),
      t = r.totals.find((t) => t.period === "current");
    assert.equal(t.gross, "5000");
    assert.equal(t.refunds, "1000");
    assert.equal(t.commission, "800");
    assert.equal(t.earnings, "3200");
    await payment(db, c, "REFUNDED", 5000);
    await call(db, "post_financial_order", [c.order]);
    await payment(db, c, "REFUNDED", 5000);
    r = await read(db);
    t = r.totals.find((t) => t.period === "current");
    assert.equal(t.refunds, "5000");
    assert.equal(t.commission, "0");
    assert.equal(t.earnings, "0");
    assert.equal(r.total, 1);
    assert.equal(r.transactions[0].status, "refunded");
    assert.equal((await read(db, { status: "paid" })).total, 0);
  }));
test("unpaid orders do not become gross volume or successful payments", () =>
  fixture(
    async (db) => {
      const r = await read(db),
        t = r.totals.find((t) => t.period === "current");
      assert.equal(t.gross, "0");
      assert.equal(t.paid, 0);
      assert.equal(t.pending, 1);
      assert.equal(r.transactions[0].status, "pending");
    },
    { paid: false },
  ));
test("date, currency, account and source filters are applied before aggregates and charts; no invented live or subscription zeros", () =>
  fixture(async (db) => {
    for (const f of [
      { currency: "JPY" },
      { account: "acct_other" },
      {
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
      },
    ]) {
      const r = await read(db, f);
      assert.equal(r.total, 0);
      assert.equal(r.totals.filter((t) => t.period === "current").length, 0);
      assert.equal(r.series.length, 0);
    }
    for (const f of [{ mode: "live" }, { source: "subscriptions" }]) {
      const r = await read(db, f);
      assert.equal(r.state, "unavailable");
      assert.deepEqual(r.transactions, []);
    }
  }));
test("report rejects invalid requests and canonical non-admin, signed-out, service-role, expired MFA access", () =>
  fixture(async (db) => {
    for (const [id, role] of [
      [ids.buyer, "authenticated"],
      [ids.a, "authenticated"],
      [null, "anon"],
      [null, "service_role"],
    ])
      await asActor(
        db,
        id,
        () =>
          assert.rejects(
            call(db, "sec_financial_command_center", args()),
            /Admin|permission|MFA|full/i,
          ),
        role,
      );
    await asActor(
      db,
      ids.admin,
      () =>
        assert.rejects(
          call(db, "sec_financial_command_center", args()),
          /MFA|Admin|full/i,
        ),
      "authenticated",
      undefined,
      "aal1",
    );
    await asActor(
      db,
      ids.admin,
      () =>
        assert.rejects(
          call(db, "sec_financial_command_center", args()),
          /MFA|Admin|full|active/i,
        ),
      "authenticated",
      randomUUID(),
    );
    const restricted = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'restricted@fixture.invalid')",
      [restricted],
    );
    await db.query(
      "insert into public.user_profiles(id,email,role,full_name) values($1,'restricted@fixture.invalid','admin','Restricted synthetic Admin')",
      [restricted],
    );
    await bindFounder(db);
    await asActor(db, restricted, () =>
      assert.rejects(
        call(db, "sec_financial_command_center", args()),
        /Admin|full|MFA/i,
      ),
    );
    await secCommand(db, "permissions", restricted, 0, "request", {
      capabilities: ["full_admin"],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await secCommand(db, "permissions", restricted, 1, "approve", {});
    await secCommand(db, "permissions", restricted, 2, "grant", {});
    await asActor(db, restricted, async () =>
      assert.equal(
        (await call(db, "sec_financial_command_center", args())).state,
        "available",
      ),
    );
    await secCommand(db, "permissions", restricted, 3, "revoke", {});
    await asActor(db, restricted, () =>
      assert.rejects(
        call(db, "sec_financial_command_center", args()),
        /Admin|full|MFA/i,
      ),
    );
    for (const f of [
      { page: 0 },
      { page: 1000001 },
      { q: "x".repeat(121) },
      { interval: "hour" },
      { start: "2000-01-01" },
      { currency: "usd" },
      { account: "secret/unsafe" },
    ])
      await assert.rejects(read(db, f), /Invalid/);
    await asActor(db, ids.admin, () =>
      assert.rejects(
        db.query(
          "select * from finance_private.command_center_rows($1,$2,$3,$4,$5,$6)",
          [start, end, "test", null, null, "all"],
        ),
        /permission/,
      ),
    );
  }));

test("more than fifty lifetime orders remain fully aggregated and individually reachable through stable server pages", () =>
  fixture(async (db, c) => {
    const { newQuote, acceptQuote } = await import(
      "./helpers/purchase-legal-fixture.mjs"
    );
    for (let i = 0; i < 55; i++) {
      const buyer = randomUUID();
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        buyer,
        `buyer${i}@fixture.invalid`,
      ]);
      await db.query(
        "insert into public.user_profiles(id,email,role,full_name) values($1,$2,'buyer',$3)",
        [buyer, `buyer${i}@fixture.invalid`, `Synthetic Buyer ${i}`],
      );
      await db.query(
        "insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference) select asset_version_id,$1,'SYNTHETIC local pagination test' from commerce_private.qa_fixture_designations where buyer_user_id=$2",
        [buyer, ids.buyer],
      );
      const q = await newQuote(db, buyer),
        accepted = await acceptQuote(db, q, buyer);
      await call(db, "prepare_purchase_completion_checkout", [
        accepted.id,
        "local",
        "acct_fixture",
      ]);
    }
    const first = await read(db),
      second = await read(db, { page: 2 }),
      third = await read(db, { page: 3 });
    assert.equal(first.total, 56);
    assert.equal(first.transactions.length, 25);
    assert.equal(second.transactions.length, 25);
    assert.equal(third.transactions.length, 6);
    assert.equal(
      new Set(
        [
          ...first.transactions,
          ...second.transactions,
          ...third.transactions,
        ].map((t) => t.id),
      ).size,
      56,
    );
    assert.equal(first.totals.find((t) => t.period === "current").orders, 56);
    assert.equal(
      first.totals.find((t) => t.period === "current").gross,
      "5000",
    );
    assert.deepEqual(first.totals, third.totals);
    assert.deepEqual(first.series, third.series);
  }));
test("mixed currencies and accounts remain separate; previous cutoffs do not inherit later refunds", () =>
  fixture(async (db, c) => {
    const order = randomUUID(),
      contract = randomUUID();
    await db.query(
      "insert into public.orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency,status) values($1,$2,$3,$4,5000,'JPY','pending')",
      [order, ids.buyer, ids.live, ids.license],
    );
    await db.query(
      "insert into public.order_delivery_contracts(id,order_id,buyer_user_id,seller_user_id,track_id,license_type_id,track_title,license_name,amount_minor,currency,payment_mode,deployment_environment) select $1,$2,buyer_user_id,seller_user_id,track_id,license_type_id,track_title,license_name,amount_minor,'JPY',payment_mode,deployment_environment from public.order_delivery_contracts where id=$3",
      [contract, order, c.contract],
    );
    await db.query(
      "insert into commerce_private.contract_context(contract_id,provider_account,rights_snapshot,license_snapshot) select $1,'acct_yen',rights_snapshot,license_snapshot from commerce_private.contract_context where contract_id=$2",
      [contract, c.contract],
    );
    await db.query(
      "insert into commerce_private.payment_events(provider_account,provider_event_id,payment_mode,livemode,contract_id,checkout_session_id,payment_intent_id,event_type,payment_state,amount_minor,currency,evidence_sha256,verification_method,provider_created_at) values('acct_yen','evt_yen','test',false,$1,'cs_test_yen','pi_yen','checkout.session.completed','PAID',5000,'JPY',$2,'stripe_signature',now())",
      [contract, "a".repeat(64)],
    );
    const r = await read(db);
    assert.deepEqual(
      r.totals
        .filter((t) => t.period === "current")
        .map((t) => [t.currency, t.gross]),
      [
        ["JPY", "5000"],
        ["USD", "5000"],
      ],
    );
    assert.equal((await read(db, { currency: "USD" })).total, 1);
    assert.equal(
      (await read(db, { account: "acct_yen" })).transactions[0].currency,
      "JPY",
    );
    assert.equal(
      r.transactions.find((t) => t.currency === "JPY").commission,
      null,
    );
    await payment(db, c, "REFUNDED", 5000);
    await call(db, "post_financial_order", [c.order]);
    const historical = await read(db, {
      start: "2026-10-01",
      end: "2026-10-23",
    });
    assert.equal(historical.transactions[0].refunds, "0");
    assert.equal(historical.transactions[0].status, "paid");
  }));
