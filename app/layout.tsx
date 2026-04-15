import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { env } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "The Sync Exchange",
  description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management.",
  icons: {
    icon: [
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
        url: "/brand/the-sync-exchange/app/AppIcon_512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    shortcut: "/brand/the-sync-exchange/app/AppIcon_256.png"
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
