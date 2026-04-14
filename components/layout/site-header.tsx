"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const marketingLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-artists", label: "For Artists" },
  { href: "/for-buyers", label: "For Buyers" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleScreenChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMenuOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setIsMenuOpen(false);
    }

    mediaQuery.addEventListener("change", handleScreenChange);
    return () => mediaQuery.removeEventListener("change", handleScreenChange);
  }, []);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;

    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-foreground"
          onClick={() => setIsMenuOpen(false)}
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-base tracking-normal">
            TS
          </span>
          <span className="truncate">The Sync Exchange</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-4 overflow-x-auto text-xs text-muted-foreground md:flex lg:gap-6 lg:text-sm">
          {marketingLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "whitespace-nowrap transition-colors hover:text-foreground",
                pathname === link.href && "text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="px-3 lg:px-4">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="px-3 lg:px-4">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-site-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="h-9 w-9 px-0"
          >
            {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 top-[72px] bg-black/45 transition-opacity duration-200 md:hidden",
          isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setIsMenuOpen(false)}
        aria-hidden="true"
      />

      <div
        id="mobile-site-menu"
        className={cn(
          "absolute inset-x-0 top-full border-b border-border/80 bg-background/98 shadow-2xl backdrop-blur transition-all duration-200 md:hidden",
          isMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-6">
          <nav className="space-y-1">
            {marketingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "flex items-center rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  pathname === link.href && "bg-accent text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-5 grid gap-3 border-t border-border/70 pt-5">
            <Button asChild variant="outline" className="w-full justify-center">
              <Link href="/login" onClick={() => setIsMenuOpen(false)}>
                Log in
              </Link>
            </Button>
            <Button asChild className="w-full justify-center">
              <Link href="/signup" onClick={() => setIsMenuOpen(false)}>
                Get Started
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
