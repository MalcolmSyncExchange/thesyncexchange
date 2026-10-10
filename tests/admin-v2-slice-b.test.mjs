import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_USER_PAGE_SIZE, adminUserSummary, parseAdminUserOptions, purchaseStates } from "../lib/admin-v2/users.ts";

const file = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("directory options are bounded and reject PostgREST filter syntax", () => {
  assert.deepEqual(parseAdminUserOptions({ q: " Alice@example.test ,(role.eq.admin)%_", role: "artist", page: "2" }), {
    query: "Alice@example.test role.eq.admin", role: "artist", page: 2, pageSize: ADMIN_USER_PAGE_SIZE
  });
  assert.equal(parseAdminUserOptions({ role: "trusted", page: "-20" }).role, "all");
  assert.equal(parseAdminUserOptions({ page: "99999999999" }).page, 1000);
  assert.equal(parseAdminUserOptions({ q: "a".repeat(200) }).query.length, 80);
});

test("canonical profile projection excludes private and metadata fields", () => {
  const summary = adminUserSummary({ id: "user-a", full_name: "  Artist A  ", email: "a@example.test", role: "artist", created_at: "2026-10-09T00:00:00Z", password_hash: "secret", user_metadata: { role: "admin" }, payout_email: "private@example.test" });
  assert.deepEqual(summary, { id: "user-a", name: "Artist A", email: "a@example.test", role: "artist", createdAt: "2026-10-09T00:00:00Z" });
  assert.equal(adminUserSummary({ id: "user-b", full_name: "Buyer", email: "b@example.test", role: null, created_at: "2026-10-09T00:00:00Z" }).role, null);
});

test("buyer support states reuse purchase-time evidence and keep domains separate", () => {
  const order = { id: "order-a", buyer_user_id: "buyer-a", track_id: "track-a", license_type_id: "license-a", status: "refunded", created_at: "2026-10-09T00:00:00Z", amount_cents: 10000, currency: "USD", agreement_generation_error: null };
  const license = { order_id: "order-a", buyer_id: "buyer-a", track_id: "track-a", license_type_id: "license-a", status: "generated", generated_at: "2026-10-09T01:00:00Z", pdf_storage_path: "private/path", generation_error: null, agreement_number: "TSE-1", terms_snapshot_json: { orderId: "order-a", buyer: { userId: "buyer-a" }, track: { id: "track-a" }, license: { typeId: "license-a", pricePaidCents: 10000, currency: "USD" }, payment: { paymentMode: "test", commercialRightsGranted: false, livemode: false } } };
  const result = purchaseStates(order, license, { title: "Blue Hour", licenseName: "Digital" });
  assert.equal(result.title, "Blue Hour");
  assert.equal(result.payment, "Refunded · TEST (no commercial rights)");
  assert.equal(result.agreement, "Issued agreement · Historical copy");
  assert.equal(result.receipt, "Unavailable");
  assert.equal(result.files, "Unavailable");
  assert.equal("pdf_storage_path" in result, false);
  assert.equal("terms_snapshot_json" in result, false);
});

test("service checks persisted Admin role before privileged queries, including demo mode", () => {
  const service = file("../services/admin/users.ts");
  const layout = file("../app/(app)/admin/layout.tsx");
  const auth = file("../services/auth/authorization.ts");
  assert.match(layout, /requireSession\("admin"\)/);
  assert.match(auth, /profile\.data\?\.role !== role/);
  assert.equal((service.match(/await requireAccountScope\("admin"\)/g) || []).length, 2);
  assert.equal((service.match(/await requireSession\("admin"\)/g) || []).length, 2);
  assert.ok(service.indexOf('await requireAccountScope("admin")') < service.indexOf("createPrivilegedSupabaseClient()"));
  assert.doesNotMatch(service, /user_metadata\.role|app_metadata\.role|auth\.admin\.listUsers/);
  assert.doesNotMatch(service, /\.select\("\*"\)/);
});

test("detail rejects malformed IDs after Admin authorization and links only existing Admin routes", () => {
  const service = file("../services/admin/users.ts");
  const view = file("../components/admin-v2/users-view.tsx");
  assert.match(service, /await requireAccountScope\("admin"\);\s*if \(!ADMIN_USER_UUID\.test\(id\)\) return null/);
  assert.match(view, /\/admin\/tracks\/\$\{track\.id\}/);
  assert.match(view, /\/admin\/orders#order-\$\{order\.id\}/);
  assert.doesNotMatch(view, /href=[^\n]*\/admin\/users\/.*(suspend|override|view-as)/);
});

test("directory has server search, role filter, deterministic bounded pagination and nonzero failure behavior", () => {
  const service = file("../services/admin/users.ts");
  assert.match(service, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(service, /\.range\(from, from \+ ADMIN_USER_PAGE_SIZE - 1\)/);
  assert.match(service, /\.eq\("role", options\.role\)/);
  assert.match(service, /\.or\(`full_name\.ilike\.%\$\{options\.query\}%,email\.ilike\.%\$\{options\.query\}%`\)/);
  assert.match(service, /if \(result\.error \|\| result\.count === null\) throw/);
  assert.match(service, /recordsSource: ordersResult\.error \? "unavailable" : countResult\.error/);
});
