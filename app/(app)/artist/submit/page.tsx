import { SubmitMusicForm } from "@/components/forms/submit-music-form";

export default function SubmitMusicPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Submit music</h1>
        <p className="mt-2 text-muted-foreground">Structure each track with buyer-facing metadata, rights clarity, and licensing settings.</p>
      </div>
      <SubmitMusicForm />
    </div>
  );
}
