"use client";

import Image from "next/image";
import { useActionState } from "react";
import { enrollTotpAction, updateAccountEmailAction, verifyTotpAction, type SecurityActionState } from "@/services/auth/account-actions";
import { AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailSecurityForm() {
  const [state, action] = useActionState(updateAccountEmailAction, {} as SecurityActionState);
  return <form action={action} className="space-y-4">
    <AuthStatusMessage error={state.error} success={state.success} />
    <div className="space-y-2"><Label htmlFor="new-email">New email</Label><Input id="new-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
    <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
    <FormSubmitButton pendingLabel="Checking account...">Request email change</FormSubmitButton>
  </form>;
}
function TotpChallenge({ factorId, next }: { factorId: string; next?: string }) {
  const [state, action] = useActionState(verifyTotpAction, {} as SecurityActionState);
  return <form action={action} className="space-y-4">
    <AuthStatusMessage error={state.error} />
    <input type="hidden" name="factorId" value={factorId} /><input type="hidden" name="next" value={next || ""} />
    <div className="space-y-2"><Label htmlFor="authenticator-code">Authenticator code</Label><Input id="authenticator-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required aria-describedby="totp-help" /></div>
    <p id="totp-help" className="text-sm text-muted-foreground">Enter the latest six-digit code. Never share this code or your setup key.</p>
    <FormSubmitButton pendingLabel="Verifying...">Verify authenticator</FormSubmitButton>
  </form>;
}
export function AdminAuthenticator({ factorId, next, canEnroll }: { factorId?: string; next?: string; canEnroll: boolean }) {
  const [setup, begin] = useActionState<SecurityActionState, FormData>(async () => enrollTotpAction(), {});
  if (factorId) return <TotpChallenge factorId={factorId} next={next} />;
  const qr = setup.qrCode?.startsWith("data:image/svg+xml") ? setup.qrCode : undefined;
  return <div className="space-y-4">
    <AuthStatusMessage error={setup.error} />
    {setup.factorId ? <>
      <p>Scan the setup code with your authenticator app, or enter the setup key manually.</p>
      {qr ? <Image unoptimized src={qr} alt="Authenticator setup QR code" width={200} height={200} referrerPolicy="no-referrer" /> : null}
      <p className="break-all rounded-md border p-3 font-mono" aria-label="Authenticator setup key">{setup.secret}</p>
      <TotpChallenge factorId={setup.factorId} next={next} />
    </> : canEnroll ? <form action={begin}><p className="mb-4 text-sm text-muted-foreground">Admin access requires an authenticator. If setup was interrupted, start again to replace only the unfinished setup. Existing verified authenticators are preserved.</p><FormSubmitButton pendingLabel="Preparing setup...">Set up authenticator</FormSubmitButton></form> : <p>Reload to check your existing authenticator or contact the founder for account recovery.</p>}
  </div>;
}
