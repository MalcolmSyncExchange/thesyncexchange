const schemaWarnings = new Set<string>();

export function isMissingColumnError(error: unknown, columnNames: string | string[]) {
  const message = getErrorMessage(error);
  if (!message.includes("does not exist") || !message.includes("column")) {
    return false;
  }

  const expected = Array.isArray(columnNames) ? columnNames : [columnNames];
  return expected.some((column) => message.includes(column));
}

export function isMissingRelationError(error: unknown, relationNames: string | string[]) {
  const message = getErrorMessage(error);
  if (!message.includes("does not exist") || !message.includes("relation")) {
    return false;
  }

  const expected = Array.isArray(relationNames) ? relationNames : [relationNames];
  return expected.some((relation) => message.includes(relation));
}

export function isSchemaCacheTableError(error: unknown, relationNames: string | string[]) {
  const message = getErrorMessage(error);
  if (!message.includes("schema cache")) {
    return false;
  }

  const expected = Array.isArray(relationNames) ? relationNames : [relationNames];
  return expected.some((relation) => message.includes(relation));
}

export function warnSchemaFallbackOnce(key: string, message: string, error?: unknown) {
  if (schemaWarnings.has(key)) {
    return;
  }

  schemaWarnings.add(key);
  const detail = getErrorMessage(error);
  console.warn(`[schema-compat:${key}] ${message}${detail ? ` (${detail})` : ""}`);
}

function getErrorMessage(error: unknown) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error.toLowerCase();
  }

  if (error instanceof Error) {
    return `${error.message} ${"details" in error ? String((error as { details?: unknown }).details || "") : ""}`.toLowerCase();
  }

  if (typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    return `${String(value.message || "")} ${String(value.details || "")} ${String(value.hint || "")}`.toLowerCase();
  }

  return String(error).toLowerCase();
}
