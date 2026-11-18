import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Session } from "@supabase/supabase-js";
import { env, getDeploymentTarget } from "@/lib/env";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

type RecoveryClient = { rpc(name: string, args: Record<string,string>): PromiseLike<{ data: unknown; error: unknown }> };
export const recoveryCookieName = () => `tse-recovery-${new URL(env.supabaseUrl!).hostname.split(".")[0]}`;
export async function issueRecoveryGrant(session: Session, verifiedUserId: string) {
  if (!session?.access_token || session.user?.id !== verifiedUserId) return null;
  let sessionId: unknown;
  try { sessionId = JSON.parse(Buffer.from(session.access_token.split(".")[1],"base64url").toString("utf8")).session_id; } catch { return null; }
  if (typeof sessionId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) return null;
  const client = createAdminSupabaseClient(); if (!client) return null;
  const proof = randomBytes(32).toString("hex");
  const result = await (client as unknown as RecoveryClient).rpc("auth_issue_recovery_grant",{p_user:verifiedUserId,p_session:sessionId,p_hash:createHash("sha256").update(proof).digest("hex")});
  return !result.error && result.data === true ? proof : null;
}
export function recoveryCookieOptions() { return { httpOnly:true,secure:getDeploymentTarget()!=="local",sameSite:"lax" as const,path:"/",maxAge:900 }; }
export async function recoveryReady(client: unknown) {
  try {
    const proof=(await cookies()).get(recoveryCookieName())?.value;
    if (!proof || !/^[0-9a-f]{64}$/.test(proof)) return false;
    const result=await (client as RecoveryClient).rpc("auth_recovery_ready",{p_proof:proof});
    return !result.error && result.data===true;
  } catch { return false; }
}
export async function consumeRecoveryGrant(client: unknown) {
  const store=await cookies(),name=recoveryCookieName(),proof=store.get(name)?.value;
  store.delete(name);
  if (!proof || !/^[0-9a-f]{64}$/.test(proof)) return false;
  try { const result=await (client as RecoveryClient).rpc("auth_consume_recovery_grant",{p_proof:proof});return !result.error && result.data===true; }
  catch { return false; }
}
