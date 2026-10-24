import { reportOperationalEvent } from "@/lib/monitoring";
import { accountJson, authorizeBuyerAccountMutation } from "@/services/auth/account-mutations";
import { clearAccountCookies } from "@/services/auth/cookies";
import { authAttempt } from "@/services/auth/security";

export async function POST(request: Request) {
  const access = await authorizeBuyerAccountMutation(request, false);
  if (access.response) return access.response;
  reportOperationalEvent("buyer_global_logout_triggered", "Authenticated account security request.", { userId: access.user.id });
  const result = await authAttempt(() => access.db.auth.signOut({ scope: "global" }));
  await clearAccountCookies();
  const message = result.error ? "Signed out on this device. Other sessions could not be confirmed signed out." : "Logged out from all devices.";
  return accountJson({ message, redirectTo: "/login?success=" + encodeURIComponent(message) });
}
