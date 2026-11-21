import { secRequest } from "@/services/admin/sec";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-v2/admin-shell";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { env, hasSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("admin");
  // The financial report uses this same database capability. Do not make its
  // navigation depend on the separately rate-limited SEC context request.
  const financialPermission = hasSupabaseEnv && !env.demoMode
    ? createServerSupabaseClient().then(client => client.rpc("sec_has_capability", {p_cap:"full_admin"}))
      .then(result => !result.error && result.data === true, () => false)
    : Promise.resolve(false);
  const [scope, financialAccess] = await Promise.all([
    secRequest({operation:"context"}).catch(()=>null) as Promise<{capabilities?:string[];founder?:boolean}|null>,
    financialPermission
  ]);
  return <AdminShell user={user} capabilities={scope?.capabilities||[]} founder={scope?.founder===true} financialAccess={financialAccess}>{children}</AdminShell>;
}
