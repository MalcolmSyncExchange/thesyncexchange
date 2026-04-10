import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
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

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  if (!user.role) {
    throw new Error("AppShell requires an authenticated user role.");
  }

  const nav = navByRole[user.role];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link href="/" className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              The Sync Exchange
            </Link>
            <p className="mt-1 text-sm text-foreground">{user.fullName}</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <form action={logoutAction}>
              <Button variant="outline" size="sm">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px,1fr] lg:px-8">
        <aside className="rounded-lg border border-border bg-background p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{user.role} workspace</p>
          <nav className="space-y-2">
            {nav.map((item: { href: string; label: string }) => (
              <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
