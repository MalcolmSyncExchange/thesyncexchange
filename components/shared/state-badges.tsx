import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/lib/utils";
import type { AdminFlagSeverity, OrderStatus, TrackStatus, VerificationStatus } from "@/types/models";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const className =
    status === "fulfilled"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "paid"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : status === "pending"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";

  return (
    <Badge variant="outline" className={className}>
      {formatEnumLabel(status)}
    </Badge>
  );
}

export function FlagSeverityBadge({ severity }: { severity: AdminFlagSeverity }) {
  const className =
    severity === "critical"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : severity === "high"
        ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
        : severity === "medium"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";

  return (
    <Badge variant="outline" className={className}>
      {formatEnumLabel(severity)}
    </Badge>
  );
}

export function FlagStatusBadge({ status }: { status: "open" | "resolved" }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "open"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }
    >
      {formatEnumLabel(status)}
    </Badge>
  );
}

export function TrackStatusBadge({ status }: { status: TrackStatus }) {
  const className =
    status === "approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "pending_review"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : status === "rejected"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";

  return (
    <Badge variant="outline" className={className}>
      {formatEnumLabel(status)}
    </Badge>
  );
}

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  const className =
    status === "verified"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "pending"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";

  return (
    <Badge variant="outline" className={className}>
      {formatEnumLabel(status)}
    </Badge>
  );
}
