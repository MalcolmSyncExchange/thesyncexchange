"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type BuyerNotificationPreferences,
  defaultBuyerNotificationPreferences,
  isBuyerSettingsDirty,
  isNotificationPreferencesDirty,
  normalizeBuyerSettings,
  normalizeNotificationPreferences,
  validateBuyerSettings
} from "@/services/buyer/settings";

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

type BuyerSettingsFormProps = {
  initialCompanyName: string;
  initialBillingEmail: string;
  currentEmail: string;
  initialNotificationPreferences?: BuyerNotificationPreferences;
  initialTeamInvites?: TeamInvite[];
  invoices?: InvoiceSummary[];
  legalOrders?: LegalOrder[];
};

type TeamInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

type InvoiceSummary = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  status: string;
  url: string | null;
};

type LegalOrder = {
  id: string;
  title: string;
  licenseName: string;
  agreementUrl: string;
  createdAt: string;
};

export function BuyerSettingsForm({
  initialCompanyName,
  initialBillingEmail,
  currentEmail,
  initialNotificationPreferences = defaultBuyerNotificationPreferences,
  initialTeamInvites = [],
  invoices = [],
  legalOrders = []
}: BuyerSettingsFormProps) {
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
  const [notificationBaseline, setNotificationBaseline] = useState(() => normalizeNotificationPreferences(initialNotificationPreferences));
  const [notifications, setNotifications] = useState(() => normalizeNotificationPreferences(initialNotificationPreferences));
  const [teamInvites, setTeamInvites] = useState(initialTeamInvites);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);
  const [logoutFeedback, setLogoutFeedback] = useState<Feedback>(null);
  const [billingFeedback, setBillingFeedback] = useState<Feedback>(null);
  const [notificationFeedback, setNotificationFeedback] = useState<Feedback>(null);
  const [teamFeedback, setTeamFeedback] = useState<Feedback>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [logoutSaving, setLogoutSaving] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const profileValues = useMemo(
    () =>
      normalizeBuyerSettings({
        companyName,
        billingEmail
      }),
    [billingEmail, companyName]
  );
  const profileDirty = isBuyerSettingsDirty(profileBaseline, profileValues);
  const notificationDirty = isNotificationPreferencesDirty(notificationBaseline, notifications);

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

  async function logoutAllDevices() {
    setLogoutSaving(true);
    setLogoutFeedback(null);
    try {
      const response = await fetch("/api/user/logout-all", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string; redirectTo?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to log out from all devices.");
      }

      setLogoutFeedback({ type: "success", message: payload?.message || "Logged out from all devices." });
      window.location.assign(payload?.redirectTo || "/login?success=Logged%20out%20from%20all%20sessions.");
    } catch (error) {
      setLogoutFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to log out from all devices." });
      setLogoutSaving(false);
    }
  }

  async function manageBilling() {
    setBillingSaving(true);
    setBillingFeedback(null);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Unable to open billing portal.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setBillingFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to open billing portal." });
      setBillingSaving(false);
    }
  }

  async function saveNotifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotificationSaving(true);
    setNotificationFeedback(null);
    try {
      const response = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(notifications)
      });
      const payload = (await response.json().catch(() => null)) as { preferences?: BuyerNotificationPreferences; error?: string } | null;

      if (!response.ok || !payload?.preferences) {
        throw new Error(payload?.error || "Unable to save notification preferences.");
      }

      const nextPreferences = normalizeNotificationPreferences(payload.preferences);
      setNotifications(nextPreferences);
      setNotificationBaseline(nextPreferences);
      setNotificationFeedback({ type: "success", message: "Notification preferences saved." });
    } catch (error) {
      setNotificationFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save notification preferences." });
    } finally {
      setNotificationSaving(false);
    }
  }

  async function inviteTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeamSaving(true);
    setTeamFeedback(null);
    try {
      const response = await fetch("/api/user/team-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });
      const payload = (await response.json().catch(() => null)) as { invite?: TeamInvite; error?: string } | null;

      if (!response.ok || !payload?.invite) {
        throw new Error(payload?.error || "Unable to invite team member.");
      }

      setTeamInvites((current) => [payload.invite!, ...current.filter((invite) => invite.id !== payload.invite!.id)]);
      setInviteEmail("");
      setInviteRole("member");
      setTeamFeedback({ type: "success", message: "Team invitation saved as pending." });
    } catch (error) {
      setTeamFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to invite team member." });
    } finally {
      setTeamSaving(false);
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
          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Log Out From All Devices</p>
                <p className="text-sm text-muted-foreground">End every active Supabase session for this account, including this browser.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowLogoutConfirm(true)} disabled={logoutSaving}>
                {logoutSaving ? "Logging Out..." : "Log Out Of All Sessions"}
              </Button>
            </div>
            <div className="mt-4">
              <FormFeedback feedback={logoutFeedback} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Manage billing contact details, account email changes, and Stripe billing portal access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Stripe Billing Portal</p>
              <p className="text-sm text-muted-foreground">Open Stripe to manage receipts, payment methods, and billing details when a Stripe customer profile exists.</p>
            </div>
            <Button type="button" variant="outline" onClick={manageBilling} disabled={billingSaving}>
              {billingSaving ? "Opening Billing..." : "Manage Billing"}
            </Button>
          </div>
          <FormFeedback feedback={billingFeedback} />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Invoices And Receipts</p>
              <p className="mt-1 text-sm text-muted-foreground">Recent Stripe invoices and receipts for this buyer account.</p>
            </div>
            {invoices.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{formatDate(invoice.date)}</p>
                      <p className="text-muted-foreground">
                        {formatMoney(invoice.amountCents, invoice.currency)} · {toDisplayStatus(invoice.status)}
                      </p>
                    </div>
                    {invoice.url ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={invoice.url} target="_blank" rel="noreferrer">
                          View Receipt
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Unavailable</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">No invoices yet.</div>
            )}
          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Control the workspace updates that should reach your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveNotifications} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  key: "purchaseReceipts" as const,
                  label: "Purchase Receipts",
                  description: "Receipts and billing confirmations after checkout."
                },
                {
                  key: "licenseAgreementReady" as const,
                  label: "License Agreement Ready",
                  description: "Notifications when agreements are generated and ready to download."
                },
                {
                  key: "platformUpdates" as const,
                  label: "Product And Platform Updates",
                  description: "Occasional updates about buyer workspace improvements."
                }
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={(event) =>
                      setNotifications((current) => ({
                        ...current,
                        [item.key]: event.target.checked
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-foreground">{item.label}</span>
                    <span className="mt-1 block text-muted-foreground">{item.description}</span>
                  </span>
                </label>
              ))}
              <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <input type="checkbox" checked className="mt-1" disabled />
                <span>
                  <span className="block font-medium text-foreground">Security Alerts</span>
                  <span className="mt-1 block text-muted-foreground">Required account protection notices. These cannot be disabled.</span>
                </span>
              </label>
            </div>
            <FormFeedback feedback={notificationFeedback} />
            <Button type="submit" disabled={!notificationDirty || notificationSaving}>
              {notificationSaving ? "Saving Preferences..." : "Save Notifications"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Prepare account administration for collaborators, supervisors, and finance contacts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">{currentEmail || "Current User"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Owner</p>
            </div>
          </div>
          <form onSubmit={inviteTeamMember} className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Team Member Email</Label>
              <Input id="inviteEmail" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="finance@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteRole">Role</Label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="billing">Billing</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={teamSaving || !inviteEmail.trim()}>
                {teamSaving ? "Saving Invite..." : "Invite Team Member"}
              </Button>
            </div>
          </form>
          <FormFeedback feedback={teamFeedback} />
          <div className="space-y-2">
            <p className="text-sm font-medium">Pending Invites</p>
            {teamInvites.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {teamInvites.map((invite) => (
                  <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-muted-foreground">
                        {toDisplayStatus(invite.role)} · {toDisplayStatus(invite.status)} · {formatDate(invite.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{toDisplayStatus(invite.status)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">No pending team invites.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal</CardTitle>
          <CardDescription>Review license history, past agreements, and order-linked legal records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/terms">Terms Of Use</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/privacy">Privacy Policy</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/buyer/orders">License History</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/buyer/orders">Download Past Agreements</Link>
            </Button>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Recent Agreements</p>
            {legalOrders.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {legalOrders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{order.title}</p>
                      <p className="text-muted-foreground">
                        {order.licenseName} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={order.agreementUrl}>Download Agreement</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">No completed agreements yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="logout-all-title">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
            <div className="space-y-2">
              <h2 id="logout-all-title" className="text-lg font-semibold">
                Log Out Of All Sessions?
              </h2>
              <p className="text-sm text-muted-foreground">This ends every active session for your account, including this browser. You will need to sign in again on each device.</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowLogoutConfirm(false)} disabled={logoutSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={logoutAllDevices} disabled={logoutSaving}>
                {logoutSaving ? "Logging Out..." : "Log Out Everywhere"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD"
  }).format(amountCents / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function toDisplayStatus(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
