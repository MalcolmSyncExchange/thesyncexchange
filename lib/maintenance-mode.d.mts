export declare const MAINTENANCE_MODE: Readonly<{ OFF: "off"; CUTOVER: "cutover" }>;
export function resolveMaintenanceMode(rawValue: unknown): {
  mode: "off" | "cutover" | "invalid";
  valid: boolean;
  blocksApplication: boolean;
};
export function isMaintenanceHealthRequest(pathname: string, method: string): boolean;
