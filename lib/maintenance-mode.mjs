export const MAINTENANCE_MODE = Object.freeze({ OFF: "off", CUTOVER: "cutover" });

/** Invalid settings deny application access instead of silently disabling the gate. */
export function resolveMaintenanceMode(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value || value === MAINTENANCE_MODE.OFF) {
    return { mode: MAINTENANCE_MODE.OFF, valid: true, blocksApplication: false };
  }
  if (value === MAINTENANCE_MODE.CUTOVER) {
    return { mode: MAINTENANCE_MODE.CUTOVER, valid: true, blocksApplication: true };
  }
  return { mode: "invalid", valid: false, blocksApplication: true };
}

export function isMaintenanceHealthRequest(pathname, method) {
  return method === "GET" && (pathname === "/api/health/config" || pathname === "/api/health/readiness");
}
