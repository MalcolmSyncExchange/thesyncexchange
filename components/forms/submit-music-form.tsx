"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { BaseSyntheticEvent, FormEvent, InputHTMLAttributes, ReactNode, RefObject } from "react";
import { forwardRef, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FieldError, FieldErrors, FieldErrorsImpl, Merge } from "react-hook-form";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { env } from "@/lib/env";
import type { StorageAssetRef } from "@/lib/storage";
import {
  assetRules,
  rightsHolderRoleValues,
  trackSubmissionFieldRules,
  trackSubmissionClientSchema,
  type TrackSubmissionValues,
  validateAssetFile
} from "@/lib/validation/track-submission";
import {
  submitTrackAction,
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

const submitTrackInitialState: SubmitTrackState = {
  success: false
};

const rightsHolderRoleLabels: Record<(typeof rightsHolderRoleValues)[number], string> = {
  writer: "Writer",
  producer: "Producer",
  publisher: "Publisher",
  owner: "Master Owner",
  other: "Other"
};

interface SubmitDiagnostics {
  mounted: boolean;
  buttonClicks: number;
  nativeSubmits: number;
  validSubmits: number;
  invalidSubmits: number;
  assetValidations: number;
  assetValidationDetails: string;
  nextAssetErrors: string;
  nextAssetErrorKeys: string;
  firstAssetError: string;
  assetErrorBranchEntered: boolean;
  afterAssetErrorBranch: boolean;
  uploadStarted: boolean;
  coverArt: boolean;
  audioFile: boolean;
  previewFile: boolean;
  waveformFile: boolean;
  lastStep: string;
  formErrors: string;
  buttonState: {
    insideForm: boolean;
    disabled: boolean;
    type: string;
    value: string;
    pointerEvents: string;
    coveredBy: string;
    nestedForms: number;
  };
}

type SubmitDiagnosticsPatch = Partial<SubmitDiagnostics> | ((current: SubmitDiagnostics) => Partial<SubmitDiagnostics>);

const initialSubmitDiagnostics: SubmitDiagnostics = {
  mounted: false,
  buttonClicks: 0,
  nativeSubmits: 0,
  validSubmits: 0,
  invalidSubmits: 0,
  assetValidations: 0,
  assetValidationDetails: "{}",
  nextAssetErrors: "{}",
  nextAssetErrorKeys: "[]",
  firstAssetError: "",
  assetErrorBranchEntered: false,
  afterAssetErrorBranch: false,
  uploadStarted: false,
  coverArt: false,
  audioFile: false,
  previewFile: false,
  waveformFile: false,
  lastStep: "server-rendered",
  formErrors: "{}",
  buttonState: {
    insideForm: false,
    disabled: false,
    type: "",
    value: "",
    pointerEvents: "",
    coveredBy: "",
    nestedForms: 0
  }
};

export function SubmitMusicForm({
  mode = "create",
  track,
  submitDebugEnabled = false
}: {
  mode?: "create" | "edit";
  track?: Track;
  submitDebugEnabled?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<SubmitTrackState>(submitTrackInitialState);
  const [diagnostics, setDiagnostics] = useState<SubmitDiagnostics>(initialSubmitDiagnostics);
  const [submitMode, setSubmitMode] = useState<"draft" | "publish">("draft");
  const [assetErrors, setAssetErrors] = useState<Record<string, string>>({});
  const [assetNames, setAssetNames] = useState<{ coverArt?: string; audioFile?: string; previewFile?: string; waveformFile?: string }>({});
  const [isPending, startTransition] = useTransition();
  const coverArtInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);
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
  const rightsHolders = watch("rightsHolders") as TrackSubmissionValues["rightsHolders"];
  const splitTotal = useMemo(
    () => rightsHolders.reduce((sum: number, holder: TrackSubmissionValues["rightsHolders"][number]) => sum + Number(holder.ownershipPercent || 0), 0),
    [rightsHolders]
  );
  const rightsHolderErrors = Array.isArray(errors.rightsHolders) ? errors.rightsHolders : [];
  const rightsHolderRootError = Array.isArray(errors.rightsHolders) ? undefined : getErrorMessage(errors.rightsHolders);
  const coverArtRequired = mode === "create" && !track?.cover_art_path && !track?.cover_art_url;
  const audioFileRequired = mode === "create" && !track?.audio_file_path && !track?.audio_file_url;
  const previewFileRequired = mode === "create" || !track?.preview_file_path;

  const updateDiagnostics = (lastStep: string, patch: SubmitDiagnosticsPatch = {}) => {
    if (!submitDebugEnabled) {
      return;
    }

    setDiagnostics((current) => {
      const nextPatch = typeof patch === "function" ? patch(current) : patch;

      return {
        ...current,
        ...nextPatch,
        lastStep,
        formErrors: nextPatch.formErrors ?? serializeFormErrors(errors),
        buttonState: inspectPublishButtonState()
      };
    });
  };

  useEffect(() => {
    updateDiagnostics("FORM MOUNTED", {
      mounted: true
    });
    // This effect intentionally runs once to prove production hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.errors) {
      return;
    }

    const nextAssetErrors: Record<string, string> = {};
    if (state.errors.coverArtPath) nextAssetErrors.coverArt = state.errors.coverArtPath;
    if (state.errors.audioFilePath) nextAssetErrors.audioFile = state.errors.audioFilePath;
    if (state.errors.previewFilePath) nextAssetErrors.previewFile = state.errors.previewFilePath;
    if (state.errors.waveformPath) nextAssetErrors.waveformFile = state.errors.waveformPath;
    if (Object.keys(nextAssetErrors).length > 0) {
      setAssetErrors((current) => ({ ...current, ...nextAssetErrors }));
    }

    Object.entries(state.errors).forEach(([path, message]) => {
      if (["coverArtPath", "audioFilePath", "previewFilePath", "waveformPath"].includes(path)) {
        return;
      }

      setError(path as Parameters<typeof setError>[0], {
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

  const onInvalidSubmit = (formErrors: FieldErrors<TrackSubmissionValues>) => {
    const firstError = findFirstFormErrorMessage(formErrors);
    updateDiagnostics("onInvalidSubmit", (current) => ({
      invalidSubmits: current.invalidSubmits + 1,
      formErrors: serializeFormErrors(formErrors)
    }));
    setState({
      success: false,
      message: firstError || "Please correct the highlighted fields before publishing."
    });
  };

  const onValidSubmit = (values: TrackSubmissionValues, event?: BaseSyntheticEvent) => {
    updateDiagnostics("onValidSubmit", (current) => ({
      validSubmits: current.validSubmits + 1
    }));
    const submitter =
      event?.nativeEvent && "submitter" in event.nativeEvent
        ? (event.nativeEvent.submitter as HTMLButtonElement | null)
        : null;
    const nextSubmitMode = submitter?.value === "publish" ? "publish" : "draft";
    setSubmitMode(nextSubmitMode);
    const coverArtFile = coverArtInputRef.current?.files?.[0];
    const audioFile = audioInputRef.current?.files?.[0];
    const previewFile = previewInputRef.current?.files?.[0];
    const waveformFile = waveformInputRef.current?.files?.[0];
    const assetPresence = {
      coverArt: Boolean(coverArtFile),
      audioFile: Boolean(audioFile),
      previewFile: Boolean(previewFile),
      waveformFile: Boolean(waveformFile)
    };
    updateDiagnostics("asset validation start", {
      ...assetPresence,
      assetValidationDetails: serializeAssetValidationDetails({
        coverArt: { file: coverArtFile, rule: assetRules.coverArt, required: mode === "create" && !track?.cover_art_path && !track?.cover_art_url },
        audioFile: { file: audioFile, rule: assetRules.audioFile, required: mode === "create" && !track?.audio_file_path && !track?.audio_file_url },
        previewFile: { file: previewFile, rule: assetRules.previewFile, required: nextSubmitMode === "publish" && !track?.preview_file_path },
        waveformFile: { file: waveformFile, rule: assetRules.waveformFile, required: false }
      })
    });

    const nextAssetErrors: Record<string, string> = {};
    const coverArtError = validateAssetFile(coverArtFile, assetRules.coverArt, mode === "create" && !track?.cover_art_path && !track?.cover_art_url);
    const audioFileError = validateAssetFile(audioFile, assetRules.audioFile, mode === "create" && !track?.audio_file_path && !track?.audio_file_url);
    const previewFileError = validateAssetFile(
      previewFile,
      assetRules.previewFile,
      nextSubmitMode === "publish" && !track?.preview_file_path
    );
    const waveformFileError = validateAssetFile(waveformFile, assetRules.waveformFile, false);

    if (coverArtError) nextAssetErrors.coverArt = coverArtError;
    if (audioFileError) nextAssetErrors.audioFile = audioFileError;
    if (previewFileError) nextAssetErrors.previewFile = previewFileError;
    if (waveformFileError) nextAssetErrors.waveformFile = waveformFileError;
    const nextAssetErrorKeys = Object.keys(nextAssetErrors);
    const firstAssetError = Object.values(nextAssetErrors).find(Boolean) || "";
    updateDiagnostics("asset validation complete", (current) => ({
      assetValidations: current.assetValidations + 1,
      ...assetPresence,
      assetValidationDetails: serializeAssetValidationDetails({
        coverArt: { file: coverArtFile, rule: assetRules.coverArt, required: mode === "create" && !track?.cover_art_path && !track?.cover_art_url, validationError: coverArtError },
        audioFile: { file: audioFile, rule: assetRules.audioFile, required: mode === "create" && !track?.audio_file_path && !track?.audio_file_url, validationError: audioFileError },
        previewFile: { file: previewFile, rule: assetRules.previewFile, required: nextSubmitMode === "publish" && !track?.preview_file_path, validationError: previewFileError },
        waveformFile: { file: waveformFile, rule: assetRules.waveformFile, required: false, validationError: waveformFileError }
      }),
      nextAssetErrors: JSON.stringify(nextAssetErrors),
      nextAssetErrorKeys: JSON.stringify(nextAssetErrorKeys),
      firstAssetError,
      assetErrorBranchEntered: false,
      afterAssetErrorBranch: false,
      uploadStarted: false
    }));

    setAssetErrors(nextAssetErrors);
    if (nextAssetErrorKeys.length > 0) {
      updateDiagnostics("asset validation blocked", {
        nextAssetErrors: JSON.stringify(nextAssetErrors),
        nextAssetErrorKeys: JSON.stringify(nextAssetErrorKeys),
        firstAssetError,
        assetErrorBranchEntered: true,
        afterAssetErrorBranch: false,
        uploadStarted: false
      });
      setState({
        success: false,
        message: firstAssetError || "Please attach the required files before publishing."
      });
      focusFirstAssetError(nextAssetErrors, {
        coverArt: coverArtInputRef,
        audioFile: audioInputRef,
        previewFile: previewInputRef,
        waveformFile: waveformInputRef
      });
      return;
    }
    updateDiagnostics("starting uploads", {
      nextAssetErrors: JSON.stringify(nextAssetErrors),
      nextAssetErrorKeys: JSON.stringify(nextAssetErrorKeys),
      firstAssetError: "",
      assetErrorBranchEntered: false,
      afterAssetErrorBranch: true,
      uploadStarted: true
    });

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
      const uploadedAssets: StorageAssetRef[] = [];

      try {
        updateDiagnostics("checking upload environment");
        if (!env.supabaseUrl || !env.supabaseAnonKey || env.demoMode) {
          throw new Error("Supabase Storage uploads require demo mode to be off and Supabase credentials to be configured.");
        }
        updateDiagnostics("upload environment ready");

        const assetScope = track?.id || `draft-${crypto.randomUUID()}`;

        if (coverArtFile) {
          updateDiagnostics("requesting cover signed URL");
          const coverArtUpload = await uploadTrackAsset({ file: coverArtFile, kind: "cover-art", scope: assetScope });
          updateDiagnostics("cover upload complete");
          uploadedAssets.push({ bucket: coverArtUpload.bucket, path: coverArtUpload.path });
          formData.set("coverArtPath", coverArtUpload.path);
        } else if (track?.cover_art_path || track?.cover_art_url) {
          formData.set("coverArtPath", track?.cover_art_path || track?.cover_art_url || "");
        }

        if (audioFile) {
          updateDiagnostics("requesting audio signed URL");
          const audioUpload = await uploadTrackAsset({ file: audioFile, kind: "audio", scope: assetScope });
          updateDiagnostics("audio upload complete");
          uploadedAssets.push({ bucket: audioUpload.bucket, path: audioUpload.path });
          formData.set("audioFilePath", audioUpload.path);
        } else if (track?.audio_file_path || track?.audio_file_url) {
          formData.set("audioFilePath", track?.audio_file_path || track?.audio_file_url || "");
        }

        if (previewFile) {
          updateDiagnostics("requesting preview signed URL");
          const previewUpload = await uploadTrackAsset({ file: previewFile, kind: "preview", scope: assetScope });
          updateDiagnostics("preview upload complete");
          uploadedAssets.push({ bucket: previewUpload.bucket, path: previewUpload.path });
          formData.set("previewFilePath", previewUpload.path);
        } else if (track?.preview_file_path) {
          formData.set("previewFilePath", track.preview_file_path);
        } else {
          formData.set("previewFilePath", "");
        }

        if (waveformFile) {
          updateDiagnostics("requesting waveform signed URL");
          const waveformUpload = await uploadTrackAsset({ file: waveformFile, kind: "waveform", scope: assetScope });
          updateDiagnostics("waveform upload complete");
          uploadedAssets.push({ bucket: waveformUpload.bucket, path: waveformUpload.path });
          formData.set("waveformPath", waveformUpload.path);
        } else if (track?.waveform_path || track?.waveform_preview_url) {
          formData.set("waveformPath", track?.waveform_path || track?.waveform_preview_url || "");
        } else {
          formData.set("waveformPath", "");
        }

        formData.set("uploadedAssets", JSON.stringify(uploadedAssets));
        if (mode === "edit" && track) {
          formData.set("trackId", track.id);
          formData.set("existingSlug", track.slug);
        }

        const result =
          mode === "edit" && track
            ? await updateTrackAction(submitTrackInitialState, formData)
            : await submitTrackAction(submitTrackInitialState, formData);
        updateDiagnostics("track action complete");
        if (!result.success) {
          await deleteTrackAssets(uploadedAssets);
        }
        setState(result);
      } catch (error) {
        await deleteTrackAssets(uploadedAssets);
        updateDiagnostics("upload error", {
          firstAssetError: error instanceof Error ? error.message : "Asset upload failed."
        });
        setState({
          success: false,
          message: error instanceof Error ? error.message : "Asset upload failed."
        });
      }
    });
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    updateDiagnostics("form onSubmit", (current) => ({
      nativeSubmits: current.nativeSubmits + 1
    }));
    void handleSubmit(onValidSubmit, onInvalidSubmit)(event);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6" data-testid="track-submit-form">
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
            <Label htmlFor="title">{requiredLabel("Track Title")}</Label>
            <Input id="title" {...register("title")} data-testid="track-title-input" />
            <HelperText text={minimumCharactersText(trackSubmissionFieldRules.title.minLength)} />
            <FieldError message={getErrorMessage(errors.title)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">{requiredLabel("Description")}</Label>
            <Textarea id="description" {...register("description")} />
            <HelperText text={minimumCharactersText(trackSubmissionFieldRules.description.minLength)} />
            <FieldError message={getErrorMessage(errors.description)} />
          </div>
          <Field label={requiredLabel("Genre")} helperText={minimumCharactersText(trackSubmissionFieldRules.genre.minLength)} error={getErrorMessage(errors.genre)}>
            <Input {...register("genre")} />
          </Field>
          <Field label={requiredLabel("Subgenre")} helperText={minimumCharactersText(trackSubmissionFieldRules.subgenre.minLength)} error={getErrorMessage(errors.subgenre)}>
            <Input {...register("subgenre")} data-testid="track-subgenre-input" />
          </Field>
          <Field label={requiredLabel("Mood(s)")} helperText={minimumCharactersText(trackSubmissionFieldRules.moods.minLength)} error={getErrorMessage(errors.moods)}>
            <Input {...register("moods")} placeholder="Driving, bright, confident" data-testid="track-moods-input" />
          </Field>
          <Field label={requiredLabel("BPM")} helperText={numericRangeText(trackSubmissionFieldRules.bpm.min, trackSubmissionFieldRules.bpm.max, "BPM")} error={getErrorMessage(errors.bpm)}>
            <Input type="number" {...register("bpm", { valueAsNumber: true })} />
          </Field>
          <Field label={requiredLabel("Key")} helperText={minimumCharactersText(trackSubmissionFieldRules.key.minLength)} error={getErrorMessage(errors.key)}>
            <Input {...register("key")} />
          </Field>
          <Field label={requiredLabel("Duration (Seconds)")} helperText={numericRangeText(trackSubmissionFieldRules.duration.min, trackSubmissionFieldRules.duration.max, "seconds")} error={getErrorMessage(errors.duration)}>
            <Input type="number" {...register("duration", { valueAsNumber: true })} />
          </Field>
          <Field label={requiredLabel("Release Year")} helperText={numericRangeText(trackSubmissionFieldRules.releaseYear.min, trackSubmissionFieldRules.releaseYear.max)} error={getErrorMessage(errors.releaseYear)}>
            <Input type="number" {...register("releaseYear", { valueAsNumber: true })} />
          </Field>
          <Field label={coverArtRequired ? requiredLabel("Cover Art") : optionalLabel("Cover Art")} error={assetErrors.coverArt}>
            <Input
              id="coverArtFile"
              data-testid="track-cover-art-input"
              ref={coverArtInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, coverArt: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, coverArt: "" }));
              }}
            />
            <HelperText text={assetNames.coverArt || assetRuleText(assetRules.coverArt)} />
            {track?.cover_art_path || track?.cover_art_url ? <HelperText text="Current cover art is already stored." /> : null}
          </Field>
          <Field label={audioFileRequired ? requiredLabel("Full Audio") : optionalLabel("Full Audio")} error={assetErrors.audioFile}>
            <Input
              id="audioFile"
              data-testid="track-audio-input"
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.aiff,.flac"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, audioFile: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, audioFile: "" }));
              }}
            />
            <HelperText text={assetNames.audioFile || assetRuleText(assetRules.audioFile)} />
            {track?.audio_file_path || track?.audio_file_url ? <HelperText text="Current source audio is already stored." /> : null}
          </Field>
          <Field label={previewFileRequired ? requiredLabel("Preview Audio") : optionalLabel("Preview Audio")} error={assetErrors.previewFile}>
            <Input
              id="previewFile"
              data-testid="track-preview-input"
              ref={previewInputRef}
              type="file"
              accept=".mp3,.wav,.aiff,.flac"
              onChange={(event) => {
                setAssetNames((current) => ({ ...current, previewFile: event.target.files?.[0]?.name }));
                setAssetErrors((current) => ({ ...current, previewFile: "" }));
              }}
            />
            <HelperText text={assetNames.previewFile || assetRuleText(assetRules.previewFile)} />
            {track?.preview_file_path ? <HelperText text="Current preview audio is already stored." /> : null}
          </Field>
          <Field label={optionalLabel("Waveform Preview")} error={assetErrors.waveformFile}>
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
            <HelperText text={assetNames.waveformFile || assetRuleText(assetRules.waveformFile)} />
            {track?.waveform_path || track?.waveform_preview_url ? <HelperText text="Current waveform asset is already stored." /> : null}
          </Field>
          <Field label={optionalLabel("Lyrics")}>
            <Textarea {...register("lyrics")} className="min-h-[100px]" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3 md:col-span-2">
            <ToggleField label={requiredLabel("Instrumental")} {...register("instrumental")} />
            <ToggleField label={requiredLabel("Vocals")} {...register("vocals")} />
            <ToggleField label={requiredLabel("Explicit")} {...register("explicit")} />
            <div className="sm:col-span-3">
              <HelperText text="Choose the metadata that describes the recording. Instrumental and vocals cannot both be selected." />
              <FieldError
                message={
                  getErrorMessage(errors.instrumental) ||
                  getErrorMessage(errors.vocals) ||
                  getErrorMessage(errors.explicit)
                }
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2">
            Cover art, preview audio, and waveform assets resolve from dedicated discovery-safe buckets. Source audio is stored privately and surfaced only through signed access for artist and admin workflows.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licensing and pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <Field label={requiredLabel("Digital Campaign Price")} helperText={minimumValueText(trackSubmissionFieldRules.priceDigital.min)} error={getErrorMessage(errors.priceDigital)}>
            <Input type="number" {...register("priceDigital", { valueAsNumber: true })} />
          </Field>
          <Field label={requiredLabel("Broadcast Price")} helperText={minimumValueText(trackSubmissionFieldRules.priceBroadcast.min)} error={getErrorMessage(errors.priceBroadcast)}>
            <Input type="number" {...register("priceBroadcast", { valueAsNumber: true })} />
          </Field>
          <Field label={requiredLabel("Exclusive Price")} helperText={minimumValueText(trackSubmissionFieldRules.priceExclusive.min)} error={getErrorMessage(errors.priceExclusive)}>
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
              <Field label={requiredLabel("Name")} helperText={minimumCharactersText(trackSubmissionFieldRules.rightsHolderName.minLength)} error={getErrorMessage(rightsHolderErrors[index]?.name)}>
                <Input {...register(`rightsHolders.${index}.name`)} />
              </Field>
              <Field label={requiredLabel("Email")} error={getErrorMessage(rightsHolderErrors[index]?.email)}>
                <Input type="email" {...register(`rightsHolders.${index}.email`)} />
              </Field>
              <Field label={requiredLabel("Role")} helperText={`Allowed roles: ${rightsHolderRoleValues.map((roleValue) => rightsHolderRoleLabels[roleValue]).join(", ")}.`} error={getErrorMessage(rightsHolderErrors[index]?.roleType)}>
                <Controller
                  control={control}
                  name={`rightsHolders.${index}.roleType`}
                  render={({ field: roleField }) => (
                    <Select value={roleField.value} onValueChange={roleField.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose role" />
                      </SelectTrigger>
                      <SelectContent>
                        {rightsHolderRoleValues.map((roleValue) => (
                          <SelectItem key={roleValue} value={roleValue}>
                            {rightsHolderRoleLabels[roleValue]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label={requiredLabel("Ownership %")} helperText="Each holder must be between 0 and 100%. Total ownership must equal 100%." error={getErrorMessage(rightsHolderErrors[index]?.ownershipPercent)}>
                <Input type="number" {...register(`rightsHolders.${index}.ownershipPercent`, { valueAsNumber: true })} />
              </Field>
              {fields.length > 1 ? (
                <div className="md:col-span-4">
                  <Button type="button" variant="outline" onClick={() => remove(index)}>
                    Remove Holder
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <FieldError message={rightsHolderRootError} />
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ name: "", email: "", roleType: "writer", ownershipPercent: 0 })}
          >
            Add Rights Holder
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
          data-testid="track-publish-submit"
          onClick={() => {
            updateDiagnostics("button onClick", (current) => ({
              buttonClicks: current.buttonClicks + 1
            }));
          }}
        >
          {isPending && submitMode === "publish" ? "Submitting..." : "Publish for Review"}
        </Button>
      </div>
      {submitDebugEnabled ? <SubmitDiagnosticPanel diagnostics={diagnostics} /> : null}
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
  helperText,
  children
}: {
  label: string;
  error?: string;
  helperText?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {helperText ? <HelperText text={helperText} /> : null}
      <FieldError message={error} />
    </div>
  );
}

const ToggleField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function ToggleField(
  props,
  ref
) {
  const { label, ...inputProps } = props;
  return (
    <label className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <span>{label}</span>
      <input ref={ref} type="checkbox" className="h-4 w-4 rounded border-border" {...inputProps} />
    </label>
  );
});

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function getErrorMessage(
  error?: string | FieldError | Merge<FieldError, FieldErrorsImpl<Record<string, never>>>
): string | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error === "string") {
    return error;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  return undefined;
}

function findFirstFormErrorMessage(errors: FieldErrors<TrackSubmissionValues>): string | undefined {
  for (const error of Object.values(errors)) {
    const directMessage = getErrorMessage(error as FieldError | Merge<FieldError, FieldErrorsImpl<Record<string, never>>>);
    if (directMessage) {
      return directMessage;
    }

    if (Array.isArray(error)) {
      for (const nestedError of error) {
        const nestedMessage = findFirstFormErrorMessage(nestedError as FieldErrors<TrackSubmissionValues>);
        if (nestedMessage) {
          return nestedMessage;
        }
      }
    } else if (error && typeof error === "object") {
      const nestedMessage = findFirstFormErrorMessage(error as FieldErrors<TrackSubmissionValues>);
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return undefined;
}

function focusFirstAssetError(
  assetErrors: Record<string, string>,
  refs: Record<string, RefObject<HTMLInputElement>>
) {
  const firstAssetKey = Object.keys(assetErrors).find((key) => assetErrors[key]);
  if (!firstAssetKey) {
    return;
  }

  const input = refs[firstAssetKey]?.current;
  input?.scrollIntoView({ block: "center", behavior: "smooth" });
  input?.focus();
}

function serializeFormErrors(errors: FieldErrors<TrackSubmissionValues>): string {
  const flattened: Record<string, string> = {};

  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const message = getErrorMessage(value as FieldError | Merge<FieldError, FieldErrorsImpl<Record<string, never>>>);
    if (message) {
      flattened[path.join(".") || "form"] = message;
      return;
    }

    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      if (key === "ref") {
        return;
      }

      visit(nestedValue, [...path, key]);
    });
  };

  visit(errors, []);
  return JSON.stringify(flattened);
}

function serializeAssetValidationDetails(
  assets: Record<
    string,
    {
      file: File | null | undefined;
      rule: (typeof assetRules)[keyof typeof assetRules];
      required: boolean;
      validationError?: string;
    }
  >
): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(assets).map(([key, asset]) => [
        key,
        {
          fileName: asset.file?.name || "",
          fileSize: asset.file?.size ?? 0,
          fileType: asset.file?.type || "",
          required: asset.required,
          maxSizeBytes: asset.rule.maxSizeBytes,
          allowedExtensions: asset.rule.allowedExtensions,
          validationError: asset.validationError || ""
        }
      ])
    )
  );
}

function inspectPublishButtonState(): SubmitDiagnostics["buttonState"] {
  if (typeof document === "undefined") {
    return initialSubmitDiagnostics.buttonState;
  }

  const button = document.querySelector<HTMLButtonElement>('[data-testid="track-publish-submit"]');
  const form = document.querySelector<HTMLFormElement>('[data-testid="track-submit-form"]');

  if (!button) {
    return {
      ...initialSubmitDiagnostics.buttonState,
      coveredBy: "button-not-found",
      nestedForms: form?.querySelectorAll("form").length ?? 0
    };
  }

  const style = window.getComputedStyle(button);
  const rect = button.getBoundingClientRect();
  const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null;
  const targetLabel = target
    ? `${target.tagName.toLowerCase()}${target.dataset.testid ? `[data-testid="${target.dataset.testid}"]` : ""}`
    : "none";

  return {
    insideForm: Boolean(form && form.contains(button)),
    disabled: button.disabled,
    type: button.type,
    value: button.value,
    pointerEvents: style.pointerEvents,
    coveredBy: targetLabel,
    nestedForms: form?.querySelectorAll("form").length ?? 0
  };
}

function SubmitDiagnosticPanel({ diagnostics }: { diagnostics: SubmitDiagnostics }) {
  const rows = [
    ["marker", "SYNC_SUBMIT_DIAGNOSTIC_V1"],
    ["mounted", diagnostics.mounted ? "true" : "false"],
    ["buttonClicks", String(diagnostics.buttonClicks)],
    ["nativeSubmits", String(diagnostics.nativeSubmits)],
    ["validSubmits", String(diagnostics.validSubmits)],
    ["invalidSubmits", String(diagnostics.invalidSubmits)],
    ["assetValidations", String(diagnostics.assetValidations)],
    ["assetValidationDetails", diagnostics.assetValidationDetails],
    ["nextAssetErrors", diagnostics.nextAssetErrors],
    ["nextAssetErrorKeys", diagnostics.nextAssetErrorKeys],
    ["firstAssetError", diagnostics.firstAssetError],
    ["assetErrorBranchEntered", String(diagnostics.assetErrorBranchEntered)],
    ["afterAssetErrorBranch", String(diagnostics.afterAssetErrorBranch)],
    ["uploadStarted", String(diagnostics.uploadStarted)],
    ["coverArt", String(diagnostics.coverArt)],
    ["audioFile", String(diagnostics.audioFile)],
    ["previewFile", String(diagnostics.previewFile)],
    ["waveformFile", String(diagnostics.waveformFile)],
    ["lastStep", diagnostics.lastStep],
    ["insideForm", String(diagnostics.buttonState.insideForm)],
    ["buttonDisabled", String(diagnostics.buttonState.disabled)],
    ["buttonType", diagnostics.buttonState.type],
    ["buttonValue", diagnostics.buttonState.value],
    ["pointerEvents", diagnostics.buttonState.pointerEvents],
    ["coveredBy", diagnostics.buttonState.coveredBy],
    ["nestedForms", String(diagnostics.buttonState.nestedForms)],
    ["formState.errors", diagnostics.formErrors]
  ];

  return (
    <aside
      data-testid="submit-debug-panel"
      className="fixed inset-x-3 bottom-3 z-50 max-h-[45vh] overflow-auto rounded-lg border border-amber-500/40 bg-background/95 p-3 text-xs shadow-xl backdrop-blur"
    >
      <div className="mb-2 font-semibold text-amber-700 dark:text-amber-300">Temporary Artist Submit Diagnostics</div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
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

function requiredLabel(label: string) {
  return `${label} *`;
}

function optionalLabel(label: string) {
  return `${label} (Optional)`;
}

function minimumCharactersText(minLength: number) {
  return `Minimum ${minLength} ${minLength === 1 ? "character" : "characters"}`;
}

function minimumValueText(minValue: number) {
  return `Minimum ${formatWholeDollarAmount(minValue)}`;
}

function numericRangeText(min: number, max: number, unit?: string) {
  const suffix = unit ? ` ${unit}` : "";
  return `${min}–${max}${suffix}`;
}

function assetRuleText(rule: (typeof assetRules)[keyof typeof assetRules]) {
  return `${formatAllowedExtensions(rule.allowedExtensions)} • ${Math.round(rule.maxSizeBytes / (1024 * 1024))} MB max`;
}

function formatAllowedExtensions(extensions: readonly string[]) {
  const labels = extensions.map(formatExtensionLabel);
  if (labels.length <= 1) {
    return labels[0] || "";
  }

  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function formatExtensionLabel(extension: string) {
  const label = extension.replace(".", "").toLowerCase();
  if (label === "webp") {
    return "WebP";
  }

  return label.toUpperCase();
}

function formatWholeDollarAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
