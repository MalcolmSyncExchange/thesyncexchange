import Link from "next/link";
import Image from "next/image";
import type { ArtistOnboardingValues } from "@/services/auth/onboarding";
import { saveArtistProfileAction } from "@/services/auth/actions";
import { ArtistIdentityFields, ArtistDeclarationFields, ArtistNoticeField } from "./artist-account-fields";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ArtistProfileEditor({ values, error, saved }: { values: ArtistOnboardingValues; error?: string; saved?: boolean }) {
  return <div className="max-w-4xl space-y-6">
    <header className="space-y-3"><p className="text-sm uppercase tracking-widest text-muted-foreground">Artist account</p><h1 className="text-3xl font-semibold">Your artist profile</h1><p className="text-muted-foreground">Update your public presentation and private account preparation. Saved changes appear in Artist Desk; catalog rights approvals remain separate.</p><div className="flex flex-wrap gap-4 text-sm"><a className="underline" href="/artist/profile/preview">Open Buyer Preview</a><Link className="underline" href="/account/security">Account Security</Link><Link className="underline" href="/artist/payout-settings">Payout status</Link></div></header>
    {error ? <p role="alert" className="rounded-md border border-destructive p-4 text-destructive">{error}</p> : null}
    {saved ? <p role="status" className="rounded-md border border-accent p-4">Profile saved. Artist Desk and Buyer Preview now use the saved public details.</p> : null}
    <form action={saveArtistProfileAction} className="space-y-8">
      <input type="hidden" name="onboardingVersion" value={values.onboardingVersion} />
      <fieldset className="space-y-5 rounded-lg border border-border p-5"><legend className="px-2 font-semibold">Public artist presentation</legend>
        <p className="text-sm text-muted-foreground">Buyers see your artist name, biography, public location, image and links. Your account display name stays in your workspace.</p>
        <div className="grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="fullName">Account display name</Label><Input id="fullName" name="fullName" minLength={2} maxLength={120} defaultValue={values.fullName} required /></div><div className="space-y-2"><Label htmlFor="artistName">Artist or stage name</Label><Input id="artistName" name="artistName" minLength={2} maxLength={120} defaultValue={values.artistName} required /></div></div>
        <div className="space-y-2"><Label htmlFor="bio">Bio</Label><Textarea id="bio" name="bio" minLength={24} maxLength={5000} defaultValue={values.bio} required rows={6} /></div>
        <div className="space-y-2"><Label htmlFor="location">Public location</Label><Input id="location" name="location" minLength={2} maxLength={120} defaultValue={values.location} required /></div>
        <div className="grid gap-5 md:grid-cols-2">{[["website","Website"],["instagram","Instagram"],["spotify","Spotify"],["youtube","YouTube"]].map(([key,label]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label} (optional)</Label><Input id={key} name={key} type={key === "instagram" ? "text" : "url"} maxLength={key === "instagram" ? 120 : 2048} defaultValue={values[key as "website" | "instagram" | "spotify" | "youtube"]} /></div>)}</div>
        {values.avatarUrl ? <Image unoptimized src={values.avatarUrl} width={96} height={96} alt="Current artist profile" className="rounded-full object-cover" /> : null}
        <div className="space-y-2"><Label htmlFor="avatarFile">Replace profile image (optional)</Label><Input id="avatarFile" name="avatarFile" type="file" accept=".jpg,.jpeg,.png,.webp" /><p className="text-xs text-muted-foreground">Static JPEG, PNG or WebP; up to 10 MiB and 16 megapixels. Images are decoded and normalized before storage.</p></div>
        {values.avatarPath ? <label className="flex gap-3 text-sm"><input type="checkbox" name="removeAvatar" />Remove current image (leave upload blank)</label> : null}
        <div className="space-y-2"><Label htmlFor="defaultLicensingPreferences">Licensing preferences (optional, internal)</Label><Textarea id="defaultLicensingPreferences" name="defaultLicensingPreferences" maxLength={3000} defaultValue={values.defaultLicensingPreferences} /></div>
      </fieldset>
      <ArtistIdentityFields values={values} /><ArtistDeclarationFields values={values} /><ArtistNoticeField accepted={values.noticeAccepted} />
      <p className="text-sm text-muted-foreground">Changes are saved together when you submit. If another tab changes this account first, reload to review the latest saved version.</p>
      <FormSubmitButton pendingLabel="Saving profile...">Save profile changes</FormSubmitButton>
    </form>
  </div>;
}
