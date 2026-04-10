import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/services/auth/session";

export default async function ArtistLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("artist");
  return <AppShell user={user}>{children}</AppShell>;
}
