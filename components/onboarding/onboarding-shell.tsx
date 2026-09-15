import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-assets";
import { cn } from "@/lib/utils";

export function OnboardingShell({ roleLabel, title, description, steps, currentStepIndex, children }: {
  roleLabel: string; title: string; description: string;
  steps: Array<{ id: string; label: string; summary?: string }>;
  currentStepIndex: number; children: ReactNode;
}) {
  const index = Math.min(Math.max(currentStepIndex, 0), Math.max(steps.length - 1, 0));
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <Link href="/"><BrandLogo className="w-[164px]" /></Link>
          <span className="text-sm text-muted-foreground">{roleLabel}</span>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[280px,1fr]">
          <aside className="space-y-5">
            <div>
              <p className="text-sm font-medium">Step {index + 1} of {steps.length}: {steps[index]?.label}</p>
              <p className="mt-2 text-sm text-muted-foreground">Progress is saved after each step.</p>
            </div>
            <div className="hidden lg:block">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            <h1 className="sr-only lg:hidden">{title}</h1>
            <ol aria-label="Setup steps" className="hidden space-y-2 lg:block">
              {steps.map((step, position) => (
                <li key={step.id} aria-current={position === index ? "step" : undefined}
                  className={cn("rounded-md px-3 py-3 text-sm text-muted-foreground", position === index && "bg-muted font-medium text-foreground")}>
                  {position + 1}. {step.label}
                  {position === index ? <span className="sr-only">, current step</span> : null}
                </li>
              ))}
            </ol>
          </aside>
          <div className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
