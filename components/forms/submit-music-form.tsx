"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { BaseSyntheticEvent, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { env } from "@/lib/env";
import {
  assetRules,
  trackSubmissionClientSchema,
  type TrackSubmissionValues,
  validateAssetFile
} from "@/lib/validation/track-submission";
import { createBrowserSupabaseClient } from "@/services/supabase/client";
import {
  submitTrackAction,
  submitTrackInitialState,
  type SubmitTrackState,
  updateTrackAction
} from "@/services/tracks/actions";
import { deleteTrackAssets, uploadTrackAsset } from "@/services/tracks/uploads";
import type { Track } from "@/types/models";

const defaultValues: TrackSubmissionValues = {
  title: "",
  description: "",
  genre: "Electronic",
  subgenre: "",
  moods: "",
  bpm: 120,
  key: "Am",
  duration: 180,
  instrumental: false,
  vocals: true,
  explicit: false,
  lyrics: "",
  releaseYear: 2026,
  priceDigital: 1200,
  priceBroadcast: 4800,
  priceExclusive: 18000,
  saveMode: "draft",
  rightsHolders: [
    { name: "Primary Writer", email: "writer@example.com", roleType: "writer", ownershipPercent: 50 },
    { name: "Publisher", email: "publisher@example.com", roleType: "publisher", ownershipPercent: 50 }
  ]
};

export function SubmitMusicForm({
  mode = "create",
  track
}: {
  mode?: "create" | "edit";
  track?: Track;
}) {
  const router = useRouter();
  const [state, setState] = useState<SubmitTrackState>(submitTrackInitialState);
  const [submitMode, setSubmitMode] = useState<"draft" | "publish">("draft");
  const [assetErrors, setAssetErrors] = useState<Record<string, string>>({});
  const [assetNames, setAssetNames] = useState<{ coverArt?: string; audioFile?: string; waveformFile?: string }>({});
  const [isPending, startTransition] = useTransition();
  const coverArtInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const waveformInputRef = useRef<HTMLInputElement | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors }
  } = useForm<TrackSubmissionValues>({
    resolver: zodResolver(trackSubmissionClientSchema),
    defaultValues: track ? buildInitialValues(track) : defaultValues
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rightsHolders" });
  const rightsHolders = watch("rightsHolders");
  const splitTotal = useMemo(
    () => rightsHolders.reduce((sum, holder) => sum + Number(holder.ownershipPercent || 0), 0),
    [rightsHolders]
  );

  useEffect(() => {
    if (!state.errors) {
      return;
    }

    Object.entries(state.errors).forEach(([path, message]) => {
      setError(path as keyof TrackSubmissionValues, {
        type: "server",
        message
      });
    });
  }, [setError, state.errors]);

  useEffect(() => {
    if (state.success) {
      reset({
        ...(track ? buildInitialValues(track) : defaultValues),
        saveMode: "draft"
      });
      setAssetNames({});
      setAssetErrors({});
      setSubmitMode("draft");
      if (state.redirectTo) {
        router.push(state.redirectTo);
      }
    }
  }, [reset, router, state.redirectTo, state.success, track]);

  const onValidSubmit = (values: TrackSubmissionValues, event?: BaseSyntheticEvent) => {
    const submitter =
      event?.nativeEvent && "submitter" in event.nativeEvent
        ? (event.nativeEvent.submitter as HTMLButtonElement | null)
        : null;
    const nextSubmitMode = submitter?.value === "publish" ? "publish" : "draft";
    setSubmitMode(nextSubmitMode);
    const coverArtFile = coverArtInputRef.current?.files?.[0];
    const audioFile = audioInputRef.current?.files?.[0];
    const waveformFile = waveformInputRef.current?.files?.[0];

    const nextAssetErrors: Record<string, string> = {};
    const coverArtError = validateAssetFile(coverArtFile, assetRules.coverArt, mode === "create" && !track?.cover_art_url);
    const audioFileError = validateAssetFile(audioFile, assetRules.audioFile, mode === "create" && !track?.audio_file_url);
    const waveformFileError = validateAssetFile(waveformFile, assetRules.waveformFile, false);

    if (coverArtError) nextAssetErrors.coverArt = coverArtError;
    if (audioFileError) nextAssetErrors.audioFile = audioFileError;
    if (waveformFileError) nextAssetErrors.waveformFile = waveformFileError;

    setAssetErrors(nextAssetErrors);
    if (Object.keys(nextAssetErrors).length > 0) {
      return;
    }

    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("description", values.description);
    formData.set("genre", values.genre);
    formData.set("subgenre", values.subgenre);
    formData.set("moods", values.moods);
    formData.set("bpm", String(values.bpm));
    formData.set("key", values.key);
    formData.set("duration", String(values.duration));
    formData.set("releaseYear", String(values.releaseYear));
    formData.set("lyrics", values.lyrics || "");
    formData.set("priceDigital", String(values.priceDigital));
    formData.set("priceBroadcast", String(values.priceBroadcast));
    formData.set("priceExclusive", String(values.priceExclusive));
    formData.set("rightsHolders", JSON.stringify(rightsHolders));
    formData.set("saveMode", nextSubmitMode);

    if (values.instrumental) formData.set("instrumental", "on");
    if (values.vocals) formData.set("vocals", "on");
    if (values.explicit) formData.set("explicit", "on");

    startTransition(async () => {
      const uploadedAssets: string[] = [];

      try {
        if (!env.supabaseUrl || !env.supabaseAnonKey || env.demoMode) {
          throw new Error("Supabase Storage uploads require demo mode to be off and Supabase credentials to be configured.");
        }

        const userId = await resolveArtistUserId();

        if (coverArtFile) {
          const coverArtUpload = await uploadTrackAsset({ file: coverArtFile, userId, kind: "cover-art" });
          uploadedAssets.push(coverArtUpload.path);
          formData.set("coverArtUrl", coverArtUpload.publicUrl);
        } else if (track?.cover_art_url) {
          formData.set("coverArtUrl", track.cover_art_url);
        }

        if (audioFile) {
          const audioUpload = await uploadTrackAsset({ file: audioFile, userId, kind: "audio" });
          uploadedAssets.push(audioUpload.path);
          formData.set("audioFileUrl", audioUpload.publicUrl);
        } else if (track?.audio_file_url) {
          formData.set("audioFileUrl", track.audio_file_url);
        }

        if (waveformFile) {
          const waveformUpload = await uploadTrackAsset({ file: waveformFile, userId, kind: "waveforms" });
          uploadedAssets.push(waveformUpload.path);
          formData.set("waveformPreviewUrl", waveformUpload.publicUrl);
        } else if (track?.waveform_preview_url) {
          formData.set("waveformPreviewUrl", track.waveform_preview_url);
        } else {
          formData.set("waveformPreviewUrl", "");
        }

        formData.set("uploadedAssetPaths", JSON.stringify(uploadedAssets));
        if (mode === "edit" && track) {
          formData.set("trackId", track.id);
          formData.set("existingSlug", track.slug);
        }

        const result =
          mode === "edit" && track
            ? await updateTrackAction(submitTrackInitialState, formData)
            : await submitTrackAction(submitTrackInitialState, formData);
        if (!result.success) {
          await deleteTrackAssets(uploadedAssets);
        }
        setState(result);
      } catch (error) {
        await deleteTrackAssets(uploadedAssets);
        setState({
          success: false,
          message: error instanceof Error ? error.message : "Asset upload failed."
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValidSubmit)} className="space-y-6">
      <input type="hidden" {...register("saveMode")} value={submitMode} readOnly />

      {state.message ? (
        <Banner success={state.success} message={state.message} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Track metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Track title</Label>
            <Input id="title" {...register("title")} />
            <FieldError message={errors.title?.message} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} />
            <FieldError message={errors.description?.message} />
          </div>
          <Field label="Genre" error={errors.genre?.message}>
            <Input {...register("genre")} />
          </Field>
          <Field label="Subgenre" error={errors.subgenre?.message}>
            <Input {...register("subgenre")} />
          </Field>
          <Field label="Mood(s)" error={errors.moods?.message}>
            <Input {...register("moods")} placeholder="Driving, bright, confident" />
          </Field>
          <Field label="BPM" error={errors.bpm?.message}>
            <Input type="number" {...register("bpm", { valueAsNumber: true })} />
          </Field>
          <Field label="Key" error={errors.key?.message}>
            <Input {...register("key")} />
          </Field>
          <Field label="Duration (seconds)" error={errors.duration?.message}>
            <Input type="number" {...register("duration", { valueAsNumber: true })} />
          </Field>
          <Field label="Release year" error={errors.releaseYear?.message}>
            <Input type="number" {...register("releaseYear", { valueAsNumber: true })} />
          </Field>
          <Field label="Cover art upload" error={assetErrors.coverArt}>
            <Input
              id="coverArtFile"
              ref={coverArtInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, coverArt: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, coverArt: "" }));
              }}
            />
            <HelperText text={assetNames.coverArt || "JPG, PNG, or WEBP up to 10MB."} />
            {track?.cover_art_url ? <HelperText text={`Current asset: ${track.cover_art_url}`} /> : null}
          </Field>
          <Field label="Audio upload" error={assetErrors.audioFile}>
            <Input
              id="audioFile"
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.aiff,.flac"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, audioFile: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, audioFile: "" }));
              }}
            />
            <HelperText text={assetNames.audioFile || "MP3, WAV, AIFF, or FLAC up to 100MB."} />
            {track?.audio_file_url ? <HelperText text={`Current asset: ${track.audio_file_url}`} /> : null}
          </Field>
          <Field label="Waveform preview upload" error={assetErrors.waveformFile}>
            <Input
              id="waveformFile"
              ref={waveformInputRef}
              type="file"
              accept=".json,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, waveformFile: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, waveformFile: "" }));
              }}
            />
            <HelperText text={assetNames.waveformFile || "Optional JSON or image preview up to 10MB."} />
            {track?.waveform_preview_url ? <HelperText text={`Current asset: ${track.waveform_preview_url}`} /> : null}
          </Field>
          <Field label="Lyrics">
            <Textarea {...register("lyrics")} className="min-h-[100px]" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3 md:col-span-2">
            <ToggleField label="Instrumental" {...register("instrumental")} />
            <ToggleField label="Vocals" {...register("vocals")} />
            <ToggleField label="Explicit" {...register("explicit")} />
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2">
            Assets upload to Supabase Storage under your artist workspace before the track record is saved.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licensing and pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <Field label="Digital campaign price" error={errors.priceDigital?.message}>
            <Input type="number" {...register("priceDigital", { valueAsNumber: true })} />
          </Field>
          <Field label="Broadcast price" error={errors.priceBroadcast?.message}>
            <Input type="number" {...register("priceBroadcast", { valueAsNumber: true })} />
          </Field>
          <Field label="Exclusive price" error={errors.priceExclusive?.message}>
            <Input type="number" {...register("priceExclusive", { valueAsNumber: true })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rights holders and splits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Current ownership total</span>
              <span className={splitTotal === 100 ? "font-medium text-foreground" : "font-medium text-destructive"}>{splitTotal}%</span>
            </div>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-4">
              <Field label="Name" error={errors.rightsHolders?.[index]?.name?.message}>
                <Input {...register(`rightsHolders.${index}.name`)} />
              </Field>
              <Field label="Email" error={errors.rightsHolders?.[index]?.email?.message}>
                <Input type="email" {...register(`rightsHolders.${index}.email`)} />
              </Field>
              <Field label="Role" error={errors.rightsHolders?.[index]?.roleType?.message}>
                <Input {...register(`rightsHolders.${index}.roleType`)} />
              </Field>
              <Field label="Ownership %" error={errors.rightsHolders?.[index]?.ownershipPercent?.message}>
                <Input type="number" {...register(`rightsHolders.${index}.ownershipPercent`, { valueAsNumber: true })} />
              </Field>
              {fields.length > 1 ? (
                <div className="md:col-span-4">
                  <Button type="button" variant="outline" onClick={() => remove(index)}>
                    Remove holder
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <FieldError message={errors.rightsHolders?.message as string | undefined} />
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ name: "", email: "", roleType: "writer", ownershipPercent: 0 })}
          >
            Add rights holder
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          value="draft"
          disabled={isPending}
        >
          {isPending && submitMode === "draft" ? "Saving..." : "Save Draft"}
        </Button>
        <Button
          type="submit"
          variant="outline"
          value="publish"
          disabled={isPending}
        >
          {isPending && submitMode === "publish" ? "Submitting..." : "Publish for Review"}
        </Button>
      </div>
    </form>
  );
}

function buildInitialValues(track: Track): TrackSubmissionValues {
  const digital = track.license_options.find((option) => option.slug === "digital-campaign");
  const broadcast = track.license_options.find((option) => option.slug === "broadcast");
  const exclusive = track.license_options.find((option) => option.slug === "exclusive-buyout");

  return {
    title: track.title,
    description: track.description,
    genre: track.genre,
    subgenre: track.subgenre,
    moods: track.mood.join(", "),
    bpm: track.bpm,
    key: track.key,
    duration: track.duration_seconds,
    instrumental: track.instrumental,
    vocals: track.vocals,
    explicit: track.explicit,
    lyrics: track.lyrics || "",
    releaseYear: track.release_year,
    priceDigital: digital?.price_override || digital?.base_price || 1200,
    priceBroadcast: broadcast?.price_override || broadcast?.base_price || 4800,
    priceExclusive: exclusive?.price_override || exclusive?.base_price || 18000,
    saveMode: "draft",
    rightsHolders: track.rights_holders.map((holder) => ({
      name: holder.name,
      email: holder.email,
      roleType: holder.role_type,
      ownershipPercent: holder.ownership_percent
    }))
  };
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function ToggleField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4 rounded border-border" {...inputProps} />
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function Banner({ success, message }: { success: boolean; message: string }) {
  return (
    <div
      className={
        success
          ? "rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
          : "rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
      }
    >
      {message}
    </div>
  );
}

function HelperText({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

async function resolveArtistUserId() {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("You must be signed in to upload submission assets.");
  }

  return user.id;
}
