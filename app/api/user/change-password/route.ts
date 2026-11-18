import { reportOperationalEvent } from "@/lib/monitoring";
import { validatePasswordChange } from "@/services/buyer/settings";
import { accountJson, authorizeBuyerAccountMutation, readAccountJson, verifyAccountPassword } from "@/services/auth/account-mutations";
import { clearAccountCookies } from "@/services/auth/cookies";
import { authAttempt } from "@/services/auth/security";

export async function POST(request: Request) {
  const access = await authorizeBuyerAccountMutation(request);
  if (access.response) return access.response;
  const body = await readAccountJson(request);
  if (!body || ["currentPassword", "newPassword", "confirmPassword"].some(key => typeof body[key] !== "string")) return accountJson({ error: "Enter your current and new passwords." }, 400);
  const validation = validatePasswordChange({ currentPassword: String(body?.currentPassword || ""), newPassword: String(body?.newPassword || ""), confirmPassword: String(body?.confirmPassword || "") });
  if (!validation.ok) return accountJson({ error: validation.error }, 400);
  reportOperationalEvent("buyer_password_update_triggered", "Authenticated account security request.", { userId: access.user.id });
  if (!(await verifyAccountPassword(access.user, validation.value.currentPassword))) return accountJson({ error: "We could not verify your current password." }, 400);
  const result = await authAttempt(() => access.db.auth.updateUser({ password: validation.value.newPassword }));
  if (result.error) return accountJson({ error: "Unable to update password right now." }, 503);
  const signedOut = await authAttempt(() => access.db.auth.signOut({ scope: "global" }));
  await clearAccountCookies();
  const message = signedOut.error ? "Password updated. Signed out on this device; other sessions could not be confirmed signed out." : "Password updated. Sign in again.";
  return accountJson({ message, redirectTo: "/login?success=" + encodeURIComponent(message) });
}
