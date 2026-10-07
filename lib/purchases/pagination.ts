export const ORDER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PurchaseCursor = { createdAt: string; id: string };
// PostgREST returns timestamptz as ISO text, including PostgreSQL microseconds.
// Validate its grammar/calendar without a Date conversion that loses precision.
function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!parts || parts[0] !== value) return false;
  const [year, month, day, hour, minute, second] = parts
    .slice(1, 7)
    .map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (!parts[7] || (Number(parts[8]) <= 15 && Number(parts[9]) <= 59))
  );
}
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
      if (input.cursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(input.cursor))
        throw new Error();
      const parsed = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf8"),
      );
      // The cursor is an owner-scoped cutoff, independent of search/filter state.
      // Changing filters in the UI starts over; reused cursors intersect the new filter.
      if (
        typeof parsed.id !== "string" ||
        parsed.id.length !== 36 ||
        !ORDER_UUID.test(parsed.id) ||
        !validTimestamp(parsed.createdAt)
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
  if (
    row.id.length !== 36 ||
    !ORDER_UUID.test(row.id) ||
    !validTimestamp(row.created_at)
  )
    throw new Error("Invalid purchase cursor.");
  return Buffer.from(
    JSON.stringify({
      createdAt: row.created_at,
      id: row.id,
    }),
  ).toString("base64url");
}
