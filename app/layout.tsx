import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { getMetadataBaseUrl } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: "The Sync Exchange",
  description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
  icons: {
    shortcut: "/favicon.ico",
    icon: [
      {
        url: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        url: "/favicon.ico"
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png"
      },
      {
        url: "/favicon-48x48.png",
        sizes: "48x48",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/AppIcon_256.png",
        sizes: "256x256",
        type: "image/png"
      },
      {
        url: "/brand/the-sync-exchange/app/AppIcon_512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  },
  openGraph: {
    title: "The Sync Exchange",
    description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
    images: [
      {
        url: "/brand/the-sync-exchange/app/AppIcon_1024.png",
        width: 1024,
        height: 1024,
        alt: "The Sync Exchange app icon"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sync Exchange",
    description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
    images: ["/brand/the-sync-exchange/app/AppIcon_1024.png"]
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
