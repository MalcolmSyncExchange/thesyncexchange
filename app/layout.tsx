import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ThemeProvider } from "@/components/layout/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "The Sync Exchange",
  description: "Premium sync licensing marketplace for artists, buyers, and music teams that need speed, trust, and clean rights management."
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
