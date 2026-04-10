import type { AdminFlagSeverity, OrderStatus } from "@/types/models";

export const FLAG_TYPE_OPTIONS = [
  "Metadata mismatch",
  "Ownership split issue",
  "Explicit content review",
  "Sample clearance concern",
  "Copyright dispute",
  "Audio quality issue",
  "Artwork rights concern",
  "Territory restriction"
] as const;

export const FLAG_SEVERITY_OPTIONS: AdminFlagSeverity[] = ["low", "medium", "high", "critical"];

export const ORDER_STATUS_STEPS: OrderStatus[] = ["pending", "paid", "fulfilled"];
