"use client";

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isBuyerSettingsDirty, normalizeBuyerSettings, validateBuyerSettings } from "@/services/buyer/settings";

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

type BuyerSettingsFormProps = {
  initialCompanyName: string;
  initialBillingEmail: string;
  currentEmail: string;
};

export function BuyerSettingsForm({ initialCompanyName, initialBillingEmail, currentEmail }: BuyerSettingsFormProps) {
  const [profileBaseline, setProfileBaseline] = useState(() =>
    normalizeBuyerSettings({
      companyName: initialCompanyName,
      billingEmail: initialBillingEmail
    })
  );
  const [companyName, setCompanyName] = useState(profileBaseline.companyName);
  const [billingEmail, setBillingEmail] = useState(profileBaseline.billingEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  const profileValues = useMemo(
    () =>
      normalizeBuyerSettings({
        companyName,
        billingEmail
      }),
    [billingEmail, companyName]
  );
  const profileDirty = isBuyerSettingsDirty(profileBaseline, profileValues);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateBuyerSettings(profileValues);
    if (!validation.ok) {
      setProfileFeedback({ type: "error", message: validation.error });
      return;
    }

    setProfileSaving(true);
    setProfileFeedback(null);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(validation.value)
      });
      const payload = (await response.json().catch(() => null)) as { profile?: { companyName: string; billingEmail: string }; error?: string } | null;

      if (!response.ok || !payload?.profile) {
        throw new Error(payload?.error || "Unable to save changes.");
      }

      const nextBaseline = normalizeBuyerSettings(payload.profile);
      setProfileBaseline(nextBaseline);
      setCompanyName(nextBaseline.companyName);
      setBillingEmail(nextBaseline.billingEmail);
      setProfileFeedback({ type: "success", message: "Changes saved" });
    } catch (error) {
      setProfileFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save changes." });
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", message: "New passwords must match." });
      return;
    }

    setPasswordSaving(true);
    setPasswordFeedback(null);
    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to update password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ type: "success", message: payload?.message || "Password updated." });
    } catch (error) {
      setPasswordFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to update password." });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailFeedback({ type: "error", message: "Enter a valid email address." });
      return;
    }

    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      const response = await fetch("/api/user/change-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          newEmail: normalizedEmail
        })
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to start email change.");
      }

      setNewEmail("");
      setEmailFeedback({ type: "success", message: payload?.message || "Check your email to confirm the change." });
    } catch (error) {
      setEmailFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to start email change." });
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Buyer Settings</p>
        <h1 className="text-3xl font-semibold">Account And Billing Settings</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keep your buyer profile, billing contact, and sign-in credentials aligned with your licensing workflow.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
          <CardDescription>Manage the company details attached to orders and generated license records.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input id="billingEmail" type="email" value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} autoComplete="email" />
              </div>
            </div>
            <FormFeedback feedback={profileFeedback} />
            <Button type="submit" disabled={!profileDirty || profileSaving}>
              {profileSaving ? "Saving Changes..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Change your password after confirming the current password for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-5 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </div>
            <div className="md:col-span-3">
              <FormFeedback feedback={passwordFeedback} />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? "Updating Password..." : "Update Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Change the login email for this buyer account. Supabase will send confirmation instructions before the change is active.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changeEmail} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currentEmail">Current Account Email</Label>
                <Input id="currentEmail" value={currentEmail} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">New Email</Label>
                <Input id="newEmail" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" />
              </div>
            </div>
            <FormFeedback feedback={emailFeedback} />
            <Button type="submit" disabled={emailSaving || !newEmail.trim()}>
              {emailSaving ? "Sending Confirmation..." : "Change Email"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormFeedback({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;

  return (
    <div
      className={
        feedback.type === "success"
          ? "rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
          : "rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
      }
      role="status"
      aria-live="polite"
    >
      {feedback.message}
    </div>
  );
}
