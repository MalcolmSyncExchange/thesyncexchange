import { reportOperationalEvent } from "@/lib/monitoring";
import { updateAccountEmailAction } from "@/services/auth/account-actions";
import { accountJson, authorizeBuyerAccountMutation, readAccountJson } from "@/services/auth/account-mutations";

export async function POST(request: Request) {
  const access = await authorizeBuyerAccountMutation(request);
  if (access.response) return access.response;
  const body = await readAccountJson(request);
  if (!body || typeof body.newEmail !== "string" || typeof body.currentPassword !== "string") return accountJson({ error: "Enter your new email and current password." }, 400);
  reportOperationalEvent("buyer_email_update_triggered", "Authenticated account security request.", { userId: access.user.id });
  const form = new FormData(); form.set("email", String(body.newEmail || "")); form.set("currentPassword", String(body.currentPassword || ""));
  const result = await updateAccountEmailAction({}, form);
  return result.error ? accountJson({ error: result.error }, 400) : accountJson({ message: result.success || "Check your email to confirm the change." });
}
