import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-v2/admin-shell";
import { requireSession } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("admin");
  return <AdminShell user={user}>{children}</AdminShell>;
}
