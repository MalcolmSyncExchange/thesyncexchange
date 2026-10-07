export const ORDER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PurchaseCursor = { createdAt: string; id: string };
export function parsePurchaseOptions(
  input: {
    cursor?: string;
    query?: string;
    filter?: string;
    size?: string;
  } = {},
) {
  const requested = Number(input.size || 25);
  const pageSize =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 25;
  const query = (input.query || "").trim().slice(0, 100);
  const filter = ["pending", "paid", "refunded"].includes(input.filter || "")
    ? input.filter!
    : "all";
  let cursor: PurchaseCursor | null = null;
  if (input.cursor) {
    try {
      if (input.cursor.length > 300) throw new Error();
      const parsed = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf8"),
      );
      // A canonical timestamp prevents PostgREST filter grammar injection.
      if (
        !ORDER_UUID.test(parsed.id) ||
        typeof parsed.createdAt !== "string" ||
        new Date(parsed.createdAt).toISOString() !== parsed.createdAt
      )
        throw new Error();
      cursor = { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new Error("Invalid purchase cursor.");
    }
  }
  return { pageSize, query, filter, cursor };
}
export function purchaseCursor(row: { id: string; created_at: string }) {
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
    }),
  ).toString("base64url");
}
