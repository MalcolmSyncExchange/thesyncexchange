"use client";

import Link from "next/link";
import { ChevronRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/layout/brand-assets";
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
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 md:pt-0">
      <div className="relative mx-auto flex min-h-[74px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center pr-16 text-foreground sm:pr-[4.5rem] md:flex-none md:pr-0"
          onClick={() => setIsMenuOpen(false)}
        >
          <BrandLogo
            priority
            className="w-[122px] max-w-full sm:w-[138px] md:w-[156px] lg:w-[184px]"
          />
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
          <ThemeToggle className="border border-black/20 bg-background text-foreground shadow-sm hover:bg-muted dark:border-white/20 dark:bg-background" />
          <Button asChild variant="ghost" size="sm" className="px-3 lg:px-4">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild size="sm" className="px-3 lg:px-4">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center md:hidden sm:right-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-site-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
            className={cn(
              "h-11 w-11 rounded-xl border border-black/20 bg-background/92 px-0 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:bg-muted dark:border-white/20 dark:bg-background/92 dark:shadow-[0_14px_30px_rgba(2,6,23,0.34)]",
              isMenuOpen &&
                "border-accent/35 bg-accent/10 text-foreground hover:bg-accent/15 dark:border-accent/45 dark:bg-accent/15 dark:hover:bg-accent/20"
            )}
          >
            <span className="relative h-4 w-4">
              <Menu
                className={cn(
                  "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                  isMenuOpen ? "rotate-12 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"
                )}
              />
              <X
                className={cn(
                  "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                  isMenuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-12 scale-75 opacity-0"
                )}
              />
            </span>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 top-[calc(74px+env(safe-area-inset-top))] z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out md:hidden dark:bg-black/55",
          isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setIsMenuOpen(false)}
        aria-hidden="true"
      />

      <div
        id="mobile-site-menu"
        className={cn(
          "fixed inset-x-0 bottom-0 top-[calc(74px+env(safe-area-inset-top))] z-40 overflow-y-auto border-t border-border/60 bg-background/95 shadow-[0_22px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-all duration-300 ease-out supports-[backdrop-filter]:bg-background/88 md:hidden dark:border-white/10 dark:shadow-[0_24px_80px_rgba(2,6,23,0.45)]",
          isMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"
        )}
      >
        <div className="mx-auto flex h-full max-w-7xl flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className="border-b border-border/70 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Explore</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Navigate the marketplace with the same clarity you expect from the product itself.
            </p>
          </div>

          <nav className="mt-5 space-y-1.5" aria-label="Mobile primary navigation">
            {marketingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "group flex items-center justify-between rounded-xl px-3.5 py-3.5 text-[15px] font-medium tracking-[0.01em] text-muted-foreground transition-all duration-200 ease-out hover:bg-foreground/[0.03] hover:text-foreground dark:hover:bg-white/[0.04]",
                  pathname === link.href &&
                    "bg-foreground/[0.04] text-foreground ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10"
                )}
              >
                <span>{link.label}</span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground",
                    pathname === link.href && "text-foreground/70"
                  )}
                />
              </Link>
            ))}
          </nav>

          <div className="mt-auto border-t border-border/70 pt-5">
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Appearance</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Adjust the interface without leaving the current flow.</p>
              </div>
              <ThemeToggle className="h-11 w-11 rounded-xl border border-black/20 bg-background/92 px-0 text-foreground shadow-sm hover:bg-muted dark:border-white/20 dark:bg-background/92" />
            </div>

            <div className="mt-4 grid gap-3">
              <Button
                asChild
                variant="outline"
                className="h-11 w-full justify-center rounded-xl border-black/15 bg-background/80 text-foreground hover:bg-foreground/[0.03] dark:border-white/15 dark:bg-background/80 dark:hover:bg-white/[0.04]"
              >
                <Link href="/login" onClick={() => setIsMenuOpen(false)}>
                  Log In
                </Link>
              </Button>
              <Button asChild className="h-11 w-full justify-center rounded-xl shadow-none">
                <Link href="/signup" onClick={() => setIsMenuOpen(false)}>
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
