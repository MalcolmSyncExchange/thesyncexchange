import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistProfilePage() {
  const user = await requireSession("artist");
  const { profile } = await getArtistWorkspaceData(user.id);

  if (!profile) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold">Artist profile</h1>
        <div className="rounded-lg border border-dashed border-border bg-background p-6 text-muted-foreground">
          Complete artist onboarding to populate your public profile.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{profile.artist_name}</h1>
      <div className="rounded-lg border border-border bg-background p-6">
        <p className="text-muted-foreground">{profile.bio}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ProfileField label="Location" value={profile.location} />
          <ProfileField label="Website" value={profile.website || "Not set"} />
          <ProfileField label="Verification" value={profile.verification_status} />
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
