import { presentPurchase, type LicenseFacts, type OrderFacts } from "../purchases/contract.ts";

export const ADMIN_USER_PAGE_SIZE = 24;
export const ADMIN_USER_MAX_PAGE = 1000;
export const ADMIN_USER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminUserRole = "artist" | "buyer" | "admin";
export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole | null;
  createdAt: string;
};
export type AdminUserDirectory = {
  items: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  role: AdminUserRole | "all";
};

export function parseAdminUserOptions(input: { q?: string; role?: string; page?: string } = {}) {
  // PostgREST `or` filter syntax is assembled server-side. Only literal search
  // characters are admitted; wildcards, punctuation and filter syntax are excluded.
  const query = (typeof input.q === "string" ? input.q : "").trim().replace(/[^a-zA-Z0-9 @.-]/g, "").slice(0, 80).trim();
  const role: AdminUserRole | "all" = (["artist", "buyer", "admin"] as const).find((value) => value === input.role) || "all";
  const requested = Number(typeof input.page === "string" ? input.page : 1);
  const page = Number.isSafeInteger(requested) && requested >= 1 ? Math.min(requested, ADMIN_USER_MAX_PAGE) : 1;
  return { query, role, page, pageSize: ADMIN_USER_PAGE_SIZE };
}

export function adminUserSummary(row: { id: string; full_name: string; email: string; role: string | null; created_at: string }): AdminUserSummary {
  const role = row.role === "artist" || row.role === "buyer" || row.role === "admin" ? row.role : null;
  return { id: row.id, name: row.full_name.trim() || "Name not provided", email: row.email, role, createdAt: row.created_at };
}

export function accountEvidence() {
  return "Profile on file" as const;
}

export function purchaseStates(order: OrderFacts, generated: LicenseFacts | null, catalog: { title?: string; licenseName?: string } = {}) {
  const purchase = presentPurchase(order, generated, catalog);
  return {
    title: purchase.title,
    licenseName: purchase.licenseName,
    payment: purchase.paymentMode === "test" ? `${purchase.payment.label} · TEST (no commercial rights)` : purchase.payment.label,
    license: purchase.license.label,
    agreement: purchase.agreement.label,
    receipt: purchase.receipt.label,
    files: purchase.files.label
  };
}
