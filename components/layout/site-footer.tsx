import Link from "next/link";

import { BrandFooterLogo } from "@/components/layout/brand-assets";

const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/discover", label: "Discover" },
      { href: "/for-artists", label: "For Artists" },
      { href: "/for-buyers", label: "For Buyers" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/pricing", label: "Pricing" }
    ]
  },
  {
    title: "Company & help",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact & Support" },
      { href: "/rights-and-licensing", label: "Rights & Licensing" }
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
          <BrandFooterLogo className="w-[208px] sm:w-[224px]" />
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            A music licensing marketplace for buyers, artists, and rightsholders. Find music, review the offer, and choose a license for your project.
          </p>
          <p className="text-xs tracking-[0.2em] text-muted-foreground">Find it. Clear it. License it.</p>
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
