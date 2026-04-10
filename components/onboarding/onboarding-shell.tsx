import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function OnboardingShell({
  roleLabel,
  title,
  description,
  steps,
  currentStepIndex,
  children
}: {
  roleLabel: string;
  title: string;
  description: string;
  steps: Array<{ id: string; label: string; summary?: string }>;
  currentStepIndex: number;
  children: ReactNode;
}) {
  const safeStepIndex = Math.max(currentStepIndex, 0);
  const progressValue = ((safeStepIndex + 1) / steps.length) * 100;
  const activeStep = steps[safeStepIndex];
  const nextStep = steps[safeStepIndex + 1];
  const remainingSteps = Math.max(steps.length - (safeStepIndex + 1), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-border/80 pb-5">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-base tracking-normal text-foreground">
              TS
            </span>
            The Sync Exchange
          </Link>
          <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {roleLabel}
          </span>
        </div>
        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[340px,1fr] xl:grid-cols-[360px,1fr]">
          <aside className="flex h-full flex-col rounded-lg border border-border bg-card/90 p-6 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Setup progress</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  Step {safeStepIndex + 1} of {steps.length}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tracking-tight text-foreground">{Math.round(progressValue)}%</p>
                <p className="text-xs text-muted-foreground">complete</p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <span>Current step</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>{activeStep?.label || "Onboarding"}</span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              {activeStep?.summary ? <p className="mt-4 text-sm font-medium text-foreground/90">{activeStep.summary}</p> : null}
            </div>

            <div className="mt-8 rounded-lg border border-border bg-background/70 p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <span>Progress</span>
                <span>{remainingSteps ? `${remainingSteps} steps left` : "Final step"}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressValue}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
                Progress is saved between steps so you can resume without losing context.
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Up next</p>
              <p className="mt-2 text-sm font-medium text-foreground">{nextStep?.label || "Final handoff"}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {nextStep?.summary || "The next action opens the workspace that matches the setup you just completed."}
              </p>
            </div>

            <div className="relative mt-8">
              <div className="absolute left-4 top-3 bottom-3 w-px bg-border" aria-hidden="true" />
              <ol className="space-y-5">
                {steps.map((step, index) => {
                  const status = index < safeStepIndex ? "complete" : index === safeStepIndex ? "current" : "upcoming";
                  return (
                    <li key={step.id} className="relative flex items-start gap-4">
                      <span
                        className={cn(
                          "relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                          status === "current" && "border-accent bg-accent text-accent-foreground shadow-sm",
                          status === "complete" && "border-accent/25 bg-accent/10 text-accent",
                          status === "upcoming" && "border-border bg-card text-muted-foreground"
                        )}
                      >
                        {status === "complete" ? <Check className="h-4 w-4" /> : index + 1}
                      </span>
                      <div className="pt-0.5">
                        <p className={cn("text-sm font-medium", status === "upcoming" ? "text-muted-foreground" : "text-foreground")}>{step.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.summary || (status === "complete" ? "Saved and ready" : status === "current" ? "Current step" : "Queued next")}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="mt-auto pt-8">
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Session safety</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  If you pause here, the next sign-in will bring you back to the right step automatically.
                </p>
              </div>
            </div>
          </aside>

          <div className="flex min-h-full flex-col rounded-lg border border-border bg-card/95 p-6 shadow-panel backdrop-blur sm:p-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
