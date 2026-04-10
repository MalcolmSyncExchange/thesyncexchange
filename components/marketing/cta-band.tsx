import type { ReactNode } from "react";

export function CtaBand({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-border bg-card px-6 py-10 sm:px-8 lg:flex lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 lg:mt-0">{actions}</div>
      </div>
    </section>
  );
}
