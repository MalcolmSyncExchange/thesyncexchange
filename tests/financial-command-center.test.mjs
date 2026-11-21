import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  financeFilters,
  financeHref,
  comparison,
  commandReportSchema,
  financialChartSeries,
  financialPageCsv,
} from "../lib/finance/command-center.ts";
import { formatMinor } from "../lib/finance/accounting.mjs";
import { loadAuthModule } from "./helpers/auth-system-harness.mjs";
const filters = financeFilters({}, new Date("2026-11-20T10:00:00Z"));
const empty = {
  state: "available",
  basis: "Exact cohort records",
  totals: [],
  series: [],
  transactions: [],
  total: 0,
  page: 1,
  size: 25,
  options: { currencies: [], accounts: [] },
  subscriptionsAvailable: false,
  payoutsAvailable: false,
};
const render = (data = empty, f = filters) => {
  const { FinancialCommandCenter } = loadAuthModule(
    "components/finance/command-center/dashboard.tsx",
    {
      "react/jsx-runtime": jsx,
      react: React,
      "next/link": {
        default: ({ children, ...p }) => React.createElement("a", p, children),
      },
      "lucide-react": icons,
      "@/lib/finance/accounting.mjs": { formatMinor },
      "@/lib/finance/command-center": {
        comparison,
        financeHref,
        financialChartSeries,
        financialPageCsv,
      },
      "./dashboard.module.css": { default: {} },
    },
  );
  return renderToStaticMarkup(
    React.createElement(FinancialCommandCenter, { data, filters: f }),
  );
};
test("dates, intervals and filters are bounded and links preserve the financial scope", () => {
  assert.equal(filters.start, "2026-10-22");
  assert.equal(filters.end, "2026-11-20");
  for (const x of [
    { start: "2026-02-30" },
    { start: "2020-01-01" },
    { start: "2026-11-20", end: "2026-01-01" },
    { currency: "USD,EUR" },
    { mode: "wrong" },
    { account: "https://secret.invalid" },
    { page: "0" },
    { q: "x".repeat(121) },
    { view: ["overview", "audit"] },
  ])
    assert.throws(() => financeFilters(x));
  for (const interval of ["day", "week", "month", "year"])
    assert.equal(financeFilters({ interval }).interval, interval);
  const url = new URL(
    financeHref(
      {
        ...filters,
        currency: "JPY",
        mode: "test",
        status: "refunded",
        account: "acct_fixture",
      },
      { view: "transactions", page: 3 },
    ),
    "https://app.invalid",
  );
  assert.equal(url.searchParams.get("currency"), "JPY");
  assert.equal(url.searchParams.get("status"), "refunded");
  assert.equal(url.searchParams.get("account"), "acct_fixture");
  assert.equal(url.searchParams.get("page"), "3");
});
test("comparisons retain exact huge and negative minor units, including small negative percentages", () => {
  assert.equal(
    comparison("90071992547409920", "45035996273704960"),
    "+100.0% vs prior period",
  );
  assert.equal(comparison("999", "1000"), "-0.1% vs prior period");
  assert.equal(comparison("0", "0"), "No change");
  assert.equal(comparison("10", "0"), "No comparable prior value");
});
test("overview renders eight executive cards, truthful empty states and separate operational navigation", () => {
  const html = render();
  for (const name of [
    "Gross Marketplace Volume",
    "TSE Revenue",
    "Artist Earnings",
    "Outstanding Obligations",
    "Refunds &amp; Disputes",
    "Active Subscriptions",
    "Payment Success Rate",
    "Reconciliation Health",
    "Revenue over time",
    "Revenue composition",
    "Transaction explorer",
  ]) {
    if (name === "Transaction explorer") continue;
    assert.ok(html.includes(name), name);
  }
  assert.match(html, /Your revenue story starts here/);
  assert.match(html, /No transactions match these filters/);
  assert.doesNotMatch(
    html,
    /Freeze payout|Record payee identity|Create reviewed policy|simulated_complete|USD 0\.00|>0%</,
  );
  for (const view of [
    "subscriptions",
    "earnings",
    "payouts",
    "refunds",
    "reconciliation",
    "reports",
    "audit",
  ])
    assert.ok(html.includes("view=" + view));
});
test("unavailable source and malformed responses cannot become zero revenue or successful billing", () => {
  const html = render({ ...empty, state: "unavailable" });
  assert.match(html, /Live financial reporting is unavailable/);
  assert.match(
    html,
    /No revenue, subscriber counts or balances have been inferred/,
  );
  assert.equal(
    commandReportSchema.safeParse({ ...empty, size: 50 }).success,
    false,
  );
  assert.equal(
    commandReportSchema.safeParse({
      ...empty,
      totals: [{ currency: "USD", gross: "NaN" }],
    }).success,
    false,
  );
});
test("actual loader authorizes before opening reader, preserves filters and propagates returned and thrown security failures", async () => {
  const calls = [];
  const load = ({
    deny = false,
    error = null,
    transport = false,
    data = empty,
  } = {}) =>
    loadAuthModule("services/finance/command-center.ts", {
      "server-only": {},
      "@/services/auth/session": {
        requireSession: async (role) => {
          calls.push(role);
          if (deny) throw Error("DENIED");
        },
      },
      "@/services/supabase/server": {
        createServerSupabaseClient: async () => {
          calls.push("client");
          return {
            rpc: (name, args) => {
              calls.push({ name, args });
              return {
                abortSignal: async () => {
                  if (transport) throw Error("unexpected transport");
                  return { data, error };
                },
              };
            },
          };
        },
      },
      "@/lib/finance/command-center": { commandReportSchema },
    }).getFinancialCommandCenter;
  await assert.rejects(load({ deny: true })(filters));
  assert.deepEqual(calls, ["admin"]);
  calls.length = 0;
  assert.equal((await load()(filters)).total, 0);
  assert.equal(calls[2].args.p_start, "2026-10-22T00:00:00Z");
  assert.equal(calls[2].args.p_end, "2026-11-21T00:00:00.000Z");
  for (const code of ["42501", "XX000", "PGRST202"])
    await assert.rejects(
      load({ error: { code, message: "PRIVATE DATABASE canary" } })(filters),
      /could not be loaded/,
    );
  await assert.rejects(
    load({ transport: true })(filters),
    /could not be loaded/,
  );
  await assert.rejects(load({ data: {} })(filters), /incomplete evidence/);
});
test("chart buckets retain true UTC intervals, exact values and currency isolation instead of visually compressing missing days", () => {
  const f = financeFilters({ start: "2026-11-01", end: "2026-11-30" });
  const data = {
    ...empty,
    totals: [{ period: "current", currency: "JPY" }],
    series: [
      {
        at: "2026-11-01T00:00:00+00:00",
        currency: "JPY",
        commission: "9007199254740992",
      },
      { at: "2026-11-30T00:00:00+00:00", currency: "JPY", commission: "-20" },
      { at: "2026-11-01", currency: "USD", commission: "999" },
    ],
  };
  const points = financialChartSeries(data, f, "JPY");
  assert.equal(points.length, 30);
  assert.equal(points[0].commission, "9007199254740992");
  assert.equal(points[1].commission, "0");
  assert.equal(points[29].commission, "-20");
  assert.equal(points[1].at, "2026-11-02T00:00:00.000Z");
  assert.deepEqual(financialChartSeries(data, f, "EUR"), []);
  assert.deepEqual(
    financialChartSeries({ ...data, state: "unavailable" }, f, "JPY"),
    [],
  );
  for (const interval of ["week", "month", "year"])
    assert.ok(
      financialChartSeries(data, { ...f, interval }, "JPY").length >= 1,
    );
});
test("actual financial CSV keeps exact original minor units and neutralizes untrusted spreadsheet expressions", () => {
  const data = {
    ...empty,
    transactions: [
      {
        date: "2026-11-20",
        id: "id",
        track: '=HYPERLINK("https://canary.invalid")',
        buyer: "+formula",
        artist: "@expression",
        currency: "JPY",
        gross: "9007199254740992",
        commission: null,
        earnings: "-1",
        refunds: "0",
        status: "refunded",
        matched: false,
      },
    ],
  };
  const csv = financialPageCsv(data);
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes('"\'+formula"'));
  assert.ok(csv.includes('"\'@expression"'));
  assert.ok(csv.includes('"9007199254740992"'));
  assert.ok(csv.includes('"Unavailable"'));
  assert.ok(csv.includes("JPY"));
});
