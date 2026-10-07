import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function DataState({
  icon: Icon,
  title,
  description,
  action,
  role
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <section role={role} className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/45 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border border-border bg-muted text-muted-foreground"><Icon aria-hidden="true" className="h-5 w-5" /></span>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
