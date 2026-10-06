import { AlertTriangle, CheckCircle2, Clock3, Circle, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DomainStatusTone = "success" | "info" | "warning" | "neutral";

const icons = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  neutral: Circle
};

export function DomainStatus({
  tone = "neutral",
  children,
  className
}: {
  tone?: DomainStatusTone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <span className={cn(
      "inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
      tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      tone === "info" && "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      tone === "warning" && "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200",
      tone === "neutral" && "border-border bg-muted/45 text-muted-foreground",
      className
    )}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

export function StatusRow({
  label,
  value,
  tone = "neutral",
  detail
}: {
  label: string;
  value: string;
  tone?: DomainStatusTone;
  detail?: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-border px-1 py-3 last:border-b-0">
      <DomainStatus tone={tone}>{value}</DomainStatus>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}
