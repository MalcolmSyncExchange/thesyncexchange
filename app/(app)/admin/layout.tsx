import { secRequest } from "@/services/admin/sec";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-v2/admin-shell";
import { requireSession } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("admin");
  const scope=await secRequest({operation:"context"}).catch(()=>null) as {capabilities?:string[];founder?:boolean}|null;
  return <AdminShell user={user} capabilities={scope?.capabilities||[]} founder={scope?.founder===true}>{children}</AdminShell>;
}
