import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/services/auth/session";

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("buyer");
  return <AppShell user={user}>{children}</AppShell>;
}
