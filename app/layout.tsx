import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { getMetadataBaseUrl } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: "The Sync Exchange",
  description: "A music licensing marketplace for buyers and artists. Find music, review what is offered, and choose a license for your project.",
  icons: {
    shortcut: "/brand/the-sync-exchange/app/blue-s-v1/favicon.ico",
    icon: [
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon.ico"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-48x48.png",
        sizes: "48x48",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-64x64.png",
        sizes: "64x64",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-96x96.png",
        sizes: "96x96",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/favicon-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: [
      {
        url: "/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  },
  openGraph: {
    title: "The Sync Exchange",
    description: "Find it. Clear it. License it. A music licensing marketplace for buyers and artists.",
    images: [
      {
        url: "/brand/the-sync-exchange/social/social-share-og-1200x630.png",
        width: 1200,
        height: 630,
        alt: "The Sync Exchange"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sync Exchange",
    description: "Find it. Clear it. License it. A music licensing marketplace for buyers and artists.",
    images: ["/brand/the-sync-exchange/social/social-share-og-1200x630.png"]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
