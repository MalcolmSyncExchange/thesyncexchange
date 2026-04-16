"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/services/auth/actions";
import type { SessionUser, UserRole } from "@/types/models";

const navByRole: Record<UserRole, Array<{ href: string; label: string }>> = {
  artist: [
    { href: "/artist/dashboard", label: "Dashboard" },
    { href: "/artist/submit", label: "Submit Music" },
    { href: "/artist/catalog", label: "My Catalog" },
    { href: "/artist/rights-holders", label: "Rights" },
    { href: "/artist/payout-settings", label: "Payouts" },
    { href: "/artist/profile", label: "Profile" }
  ],
  buyer: [
    { href: "/buyer/dashboard", label: "Dashboard" },
    { href: "/buyer/catalog", label: "Catalog" },
    { href: "/buyer/favorites", label: "Favorites" },
    { href: "/buyer/orders", label: "Orders" },
    { href: "/buyer/settings", label: "Settings" }
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/review-queue", label: "Review Queue" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/tracks", label: "Tracks" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/compliance", label: "Compliance" },
    { href: "/admin/analytics", label: "Analytics" }
  ]
};

const roleLabels: Record<UserRole, string> = {
  artist: "Artist Workspace",
  buyer: "Buyer Workspace",
  admin: "Admin Workspace"
};

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (!user.role) {
    throw new Error("AppShell requires an authenticated user role.");
  }

  const nav = navByRole[user.role];
  const roleLabel = roleLabels[user.role];

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleScreenChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileNavOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setIsMobileNavOpen(false);
    }

    mediaQuery.addEventListener("change", handleScreenChange);
    return () => mediaQuery.removeEventListener("change", handleScreenChange);
  }, []);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;

    if (isMobileNavOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileNavOpen]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 md:pt-0">
        <div className="relative mx-auto flex min-h-[74px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1 pr-16 lg:pr-0">
            <Link href="/" className="flex items-center">
              <BrandLogo className="w-[124px] sm:w-[140px] lg:w-[188px]" />
            </Link>
            <div className="mt-1 flex items-center gap-2 lg:hidden">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent/85" />
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{roleLabel}</p>
            </div>
            <div className="mt-1 hidden items-center gap-2 text-sm lg:flex">
              <p className="truncate font-medium text-foreground">{user.fullName}</p>
              <span className="inline-flex h-1 w-1 rounded-full bg-border" />
              <p className="text-muted-foreground">{roleLabel}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <ThemeToggle className="border border-black/20 bg-background text-foreground shadow-sm hover:bg-muted dark:border-white/20 dark:bg-background" />
            <form action={logoutAction}>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-black/15 bg-background/80 px-4 dark:border-white/15 dark:bg-background/80"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </form>
          </div>

          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center lg:hidden sm:right-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={isMobileNavOpen ? "Close workspace menu" : "Open workspace menu"}
              aria-expanded={isMobileNavOpen}
              aria-controls="workspace-mobile-menu"
              onClick={() => setIsMobileNavOpen((open) => !open)}
              className={cn(
                "h-11 w-11 rounded-xl border border-black/20 bg-background/92 px-0 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:bg-muted dark:border-white/20 dark:bg-background/92 dark:shadow-[0_14px_30px_rgba(2,6,23,0.34)]",
                isMobileNavOpen &&
                  "border-accent/35 bg-accent/10 text-foreground hover:bg-accent/15 dark:border-accent/45 dark:bg-accent/15 dark:hover:bg-accent/20"
              )}
            >
              <span className="relative h-4 w-4">
                <Menu
                  className={cn(
                    "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                    isMobileNavOpen ? "rotate-12 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                    isMobileNavOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-12 scale-75 opacity-0"
                  )}
                />
              </span>
            </Button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 top-[calc(74px+env(safe-area-inset-top))] z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out lg:hidden dark:bg-black/55",
          isMobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setIsMobileNavOpen(false)}
        aria-hidden="true"
      />

      <div
        id="workspace-mobile-menu"
        className={cn(
          "fixed inset-x-0 bottom-0 top-[calc(74px+env(safe-area-inset-top))] z-40 overflow-y-auto border-t border-border/60 bg-background/95 shadow-[0_22px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-all duration-300 ease-out supports-[backdrop-filter]:bg-background/88 lg:hidden dark:border-white/10 dark:shadow-[0_24px_80px_rgba(2,6,23,0.45)]",
          isMobileNavOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"
        )}
      >
        <div className="mx-auto flex h-full max-w-7xl flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className="border-b border-border/70 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">{roleLabel}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{user.fullName}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Navigate the operational side of the marketplace with the same clarity as the core workflow.
            </p>
          </div>

          <nav className="mt-5 space-y-1.5" aria-label={`${roleLabel} navigation`}>
            {nav.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={cn(
                    "group flex items-center justify-between rounded-xl px-3.5 py-3.5 text-[15px] font-medium tracking-[0.01em] text-muted-foreground transition-all duration-200 ease-out hover:bg-foreground/[0.03] hover:text-foreground dark:hover:bg-white/[0.04]",
                    active &&
                      "bg-foreground/[0.04] text-foreground ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10"
                  )}
                >
                  <span>{item.label}</span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground",
                      active && "text-foreground/70"
                    )}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border/70 pt-5">
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Appearance</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Switch the interface for the way you work.</p>
              </div>
              <ThemeToggle className="h-11 w-11 rounded-xl border border-black/20 bg-background/92 px-0 text-foreground shadow-sm hover:bg-muted dark:border-white/20 dark:bg-background/92" />
            </div>

            <form action={logoutAction} className="mt-4">
              <Button
                variant="outline"
                className="h-11 w-full justify-between rounded-xl border-black/15 bg-background/80 px-4 text-foreground hover:bg-foreground/[0.03] dark:border-white/15 dark:bg-background/80 dark:hover:bg-white/[0.04]"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Log Out
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px,1fr] lg:gap-8 lg:px-8">
        <aside className="hidden rounded-xl border border-border bg-background/95 p-4 shadow-sm lg:block">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{roleLabel}</p>
          <nav className="space-y-1.5">
            {nav.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 ease-out hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground ring-1 ring-black/5 dark:ring-white/10"
                  )}
                >
                  <span>{item.label}</span>
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground", active && "text-foreground/70")} />
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
