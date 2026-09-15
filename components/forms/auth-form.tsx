import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MailCheck } from "lucide-react";

import { FormSubmitButton } from "@/components/forms/form-submit-button";
import styles from "./auth-form.module.css";
import surface from "@/components/layout/sync-surface.module.css";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types/models";

export function AuthPageShell({
  eyebrow,
  title,
  description,
  highlights,
  compact = false,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  highlights: Array<{ label: string; value: string }>;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <section className={styles.intro}>
        <p className={surface.eyebrow}>{eyebrow}</p>
        <h1 className={surface.heading}>{title}</h1>
        <p className={surface.description}>{description}</p>
        <ol className={cn(styles.highlights, compact && styles.compact)}>
          {highlights.map(item => <li key={item.label}><CheckCircle2 aria-hidden="true" size={24} /><div><h2>{item.label}</h2><p>{item.value}</p></div></li>)}
        </ol>
      </section>
      <div className={styles.formColumn}>{children}</div>
    </div>
  );
}

export function AuthPanel({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <section className={styles.panel}>
    <header className={styles.panelHeader}>
      {eyebrow ? <p className={surface.eyebrow}>{eyebrow}</p> : null}
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
    {children}
  </section>;
}

export function AuthStatusMessage({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {success ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</div>
      ) : null}
    </>
  );
}

export function AuthConfirmationNotice({
  email,
  returnTo,
  action
}: {
  email?: string;
  returnTo: string;
  action: (formData: FormData) => Promise<void>;
}) {
  if (!email) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground">
          <MailCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Confirmation required</p>
            <p className="mt-1 text-sm font-medium text-foreground">{email}</p>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Open the confirmation link in your inbox to activate your account and continue setup.
          </p>
          <form action={action} className="flex flex-wrap items-center gap-3 pt-1">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <FormSubmitButton variant="outline" pendingLabel="Sending Confirmation...">
              Resend Confirmation Email
            </FormSubmitButton>
            <Link href="/login" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
              Back to Login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AuthSessionNotice({
  user,
  continueHref,
  intent
}: {
  user: SessionUser | null;
  continueHref: string;
  intent: "login" | "signup";
}) {
  if (!user) {
    return null;
  }

  const roleLabel = user.role ? user.role[0].toUpperCase() + user.role.slice(1) : "Unassigned";

  return (
    <div className="rounded-md border border-border bg-muted/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Active session</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{user.fullName || user.email}</p>
          <p className="text-sm text-muted-foreground">
            {intent === "login"
              ? `You’re already signed in as ${roleLabel}. Use this page to sign into a different account, or continue where you left off.`
              : `You’re already signed in as ${roleLabel}. Continue with the current workspace, or create a different account in a new session.`}
          </p>
        </div>
        <Link href={continueHref} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
          Continue to Workspace
        </Link>
      </div>
    </div>
  );
}

export function AuthFooterLink({ href, label, actionLabel }: { href: string; label: string; actionLabel: string }) {
  return (
    <span>
      {label}{" "}
      <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
        {actionLabel}
      </Link>
    </span>
  );
}

export function AuthRoleCard({
  href,
  eyebrow,
  title,
  description,
  bullets,
  className
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-lg border border-border bg-card p-6 shadow-panel transition-colors hover:border-foreground/20 hover:bg-card/80",
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
      </div>
      <div className="mt-6 space-y-2">
        {bullets.map((bullet) => (
          <p key={bullet} className="text-sm text-muted-foreground">
            {bullet}
          </p>
        ))}
      </div>
    </Link>
  );
}
