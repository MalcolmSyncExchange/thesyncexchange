import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-assets";

const footerColumns = [
  {
    title: "Platform",
    links: [
      { href: "/how-it-works", label: "How It Works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/for-artists", label: "For Artists" },
      { href: "/for-buyers", label: "For Buyers" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/login", label: "Log In" },
      { href: "/signup", label: "Create Account" }
    ]
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms Of Use" },
      { href: "/privacy", label: "Privacy Policy" }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr,1fr] lg:px-8">
        <div className="space-y-4">
          <BrandLogo className="w-[176px] sm:w-[196px]" />
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Premium music licensing infrastructure for artists, supervisors, agencies, and brands that need fast clearance and credible catalog quality.
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fast clearance. Premium catalog. Institutional-grade trust.</p>
        </div>
        <div className="grid gap-10 sm:grid-cols-3">
          {footerColumns.map((column) => (
            <div key={column.title} className="space-y-4">
              <h3 className="text-sm font-medium">{column.title}</h3>
              <div className="space-y-3">
                {column.links.map((link) => (
                  <Link key={link.href} href={link.href} className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
