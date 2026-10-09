"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Eye,
  FileAudio,
  FileImage,
  FileLock2,
  Music2,
  Pencil,
  ShieldAlert,
  SlidersHorizontal,
  Volume2
} from "lucide-react";

import { PreviewAudioButton } from "@/components/audio/preview-audio-provider";
import { ArtistTrackStatus } from "@/components/artist/tracks/artist-track-status";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";
import { DomainStatus, StatusRow } from "@/components/ui/domain-status";
import { ResponsiveTabs } from "@/components/ui/responsive-tabs";
import { formatCurrency, formatDuration } from "@/lib/utils";
import type { ArtistTrackDetail as ArtistTrackDetailData } from "@/services/artist/catalog-contract";
import styles from "./artist-track-detail.module.css";

export function ArtistTrackDetail({ track }: { track: ArtistTrackDetailData }) {
  const previewTrack = track.preview ? { ...track.preview, href: `/artist/tracks/${track.slug}` } : null;
  const coreMetadataRecorded = Boolean(track.title && track.genre && track.durationSeconds);
  const identityDetails = [track.genre, track.subgenre, track.durationSeconds ? formatDuration(track.durationSeconds) : null, track.musicalKey, track.releaseYear || null].filter(Boolean);
  const rightsAttention = true;
  const tabs = [
    { id: "overview", label: "Overview", panel: <OverviewPanel track={track} coreMetadataRecorded={coreMetadataRecorded} /> },
    { id: "audio-assets", label: "Audio & Assets", panel: <AssetsPanel track={track} /> },
    { id: "rights", label: "Rights & Splits", attention: rightsAttention, panel: <RightsPanel track={track} /> },
    { id: "licensing", label: "Licensing", panel: <LicensingPanel track={track} /> },
    { id: "activity", label: "Activity", panel: <DeferredPanel icon={Clock3} title="Track activity is not available yet" description="The current audit history is private to platform review. Artist-visible activity requires an approved, authorized contract before events can appear here." /> },
    { id: "analytics", label: "Analytics", panel: <DeferredPanel icon={BarChart3} title="Analytics starts after instrumentation is enabled" description="Plays, saves, conversion, and revenue are not shown until authoritative event definitions and reporting are available. No zeroes are being inferred." /> }
  ];

  return (
    <div className={styles.page} data-testid="artist-track-detail">
      <Link href="/artist/catalog" className={styles.backLink}><ArrowLeft aria-hidden="true" />Back to catalog</Link>
      <header className={styles.header}>
        <div className={styles.cover}>
          {track.coverArtUrl ? <Image src={track.coverArtUrl} alt={`${track.title} cover`} fill priority sizes="(max-width: 560px) 96px, 150px" className={styles.coverImage} /> : <Music2 aria-hidden="true" />}
        </div>
        <div className={styles.identity}>
          <div className={styles.identityMeta}><ArtistTrackStatus track={track} className={styles.statusSummary} /><span>Updated {formatDate(track.updatedAt)}</span></div>
          <p className={styles.eyebrow}>Track</p>
          <h1>{track.title}</h1>
          <p>{track.artistName}</p>
          <div className={styles.inlineMeta}>{identityDetails.map((detail, index) => <span key={`${detail}-${index}`}>{index > 0 ? <i aria-hidden="true" /> : null}{detail}</span>)}</div>
        </div>
        <div className={styles.actions}>
          <Button asChild variant="outline"><Link href={`/artist/tracks/${track.slug}/preview`}><Eye aria-hidden="true" className="h-4 w-4" />Buyer Preview</Link></Button>
          <Button asChild><Link href={`/artist/tracks/${track.slug}/edit`}><Pencil aria-hidden="true" className="h-4 w-4" />Edit track</Link></Button>
        </div>
      </header>

      <section className={styles.previewCard} aria-label="Buyer preview audio">
        {previewTrack ? <PreviewAudioButton track={previewTrack} className={styles.widePreviewButton} /> : <Button type="button" variant="outline" disabled className={styles.widePreviewButton}><FileAudio aria-hidden="true" />Preview unavailable</Button>}
        <div className={styles.previewText}><strong>Buyer preview</strong><span>{track.assets.buyerPreviewReady ? "Play the public-safe preview in the shared player." : "Add a Buyer preview before this track can appear in Discover."}</span></div>
        <div className={styles.previewNote}><Volume2 aria-hidden="true" /><span>Play to open seek and volume controls</span></div>
      </section>

      <ResponsiveTabs items={tabs} initialId="overview" />
    </div>
  );
}

function OverviewPanel({ track, coreMetadataRecorded }: { track: ArtistTrackDetailData; coreMetadataRecorded: boolean }) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Marketplace state</p><h2>Buyer visibility</h2><p>{track.buyerVisibility.explanation}</p></div>
          <DomainStatus tone={track.buyerVisibility.tone}>{track.buyerVisibility.label}</DomainStatus>
        </div>
        {track.buyerVisibility.blockers.length ? <div className={styles.notice}><AlertTriangle aria-hidden="true" /><div><strong>Needs attention before Discover</strong><p>{track.buyerVisibility.explanation}</p></div></div> : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Current facts</p><h2>Track readiness</h2><p>These states use existing track, preview, and license records. Rights-layer readiness remains unavailable.</p></div></div>
        <div className={styles.readinessGrid}>
          <StatusRow label="Audio references" value={track.assets.fullMasterStored && track.assets.buyerPreviewReady ? "Recorded" : "Needs attention"} tone={track.assets.fullMasterStored && track.assets.buyerPreviewReady ? "success" : "warning"} detail={track.assets.fullMasterStored ? (track.assets.buyerPreviewReady ? "Protected source and Buyer preview references recorded" : "Buyer preview is missing") : "Protected source is not recorded"} />
          <StatusRow label="Core metadata" value={coreMetadataRecorded ? "Recorded" : "Needs details"} tone={coreMetadataRecorded ? "success" : "warning"} detail="Title, genre, and duration only; not an overall readiness decision" />
          <StatusRow label="Rights & splits" value="Legacy records" tone="warning" detail="Recording and Composition completion cannot be verified yet" />
          <StatusRow label="Licensing" value={track.activeLicenseCount ? "Configured" : "Needs attention"} tone={track.activeLicenseCount ? "success" : "warning"} detail={`${track.activeLicenseCount} active ${track.activeLicenseCount === 1 ? "option" : "options"}`} />
        </div>
      </section>

      <div className={styles.twoColumn}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Track record</p><h2>Metadata</h2></div></div>
          <dl className={styles.metadata}>
            <Metadata label="Title" value={track.title} />
            <Metadata label="Artist" value={track.artistName} />
            <Metadata label="Genre" value={[track.genre, track.subgenre].filter(Boolean).join(" · ")} />
            <Metadata label="Mood" value={track.moods.join(", ") || "Not provided"} />
            <Metadata label="BPM" value={String(track.bpm || "Not provided")} />
            <Metadata label="Key" value={track.musicalKey || "Not provided"} />
            <Metadata label="Duration" value={formatDuration(track.durationSeconds)} />
            <Metadata label="Release year" value={String(track.releaseYear || "Not provided")} />
            <Metadata label="Vocals" value={track.vocals ? "Vocals" : track.instrumental ? "Instrumental" : "Not provided"} />
            <Metadata label="Explicit" value={track.explicit ? "Yes" : "No"} />
          </dl>
          {track.description ? <p className={styles.description}>{track.description}</p> : <p className={styles.description}>No public description has been provided.</p>}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Public artwork</p><h2>Cover art</h2></div></div>
          <div className={styles.coverSummary}>
            <div className={styles.coverSmall}>{track.coverArtUrl ? <Image src={track.coverArtUrl} alt="" fill sizes="120px" className={styles.coverImage} /> : <FileImage aria-hidden="true" />}</div>
            <div><DomainStatus tone={track.assets.artworkReady ? "success" : "warning"}>{track.assets.artworkReady ? "Ready" : "Not provided"}</DomainStatus><p>{track.assets.artworkReady ? "Shown in Buyer discovery and Buyer Preview." : "Add artwork in the compatibility editor."}</p></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AssetsPanel({ track }: { track: ArtistTrackDetailData }) {
  const assets = [
    { icon: FileLock2, label: "Full Master", ready: track.assets.fullMasterStored, detail: "Protected source recording. The player never receives this file or its private path." },
    { icon: FileAudio, label: "Buyer preview", ready: track.assets.buyerPreviewReady, detail: "Public-safe audio used by Discover and Buyer Preview." },
    { icon: FileImage, label: "Cover art", ready: track.assets.artworkReady, detail: "Public artwork shown with this track." },
    { icon: SlidersHorizontal, label: "Waveform", ready: track.assets.waveformReady, detail: "Stored waveform visual when available; player progress remains operable without it." }
  ];
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Current inventory</p><h2>Audio & Assets</h2><p>This summary reports only the four asset references supported by the current track record. Optional mixes and Stems belong to a later submission slice.</p></div><DomainStatus tone={track.assets.availableCount === track.assets.trackedCount ? "success" : "warning"}>{track.assets.availableCount} of {track.assets.trackedCount} recorded</DomainStatus></div>
      <div className={styles.assetList}>{assets.map(({ icon: Icon, label, ready, detail }) => <div key={label} className={styles.assetRow}><span className={styles.assetIcon}><Icon aria-hidden="true" /></span><div><strong>{label}</strong><p>{detail}</p></div><DomainStatus tone={ready ? "success" : "warning"}>{ready ? "Recorded" : "Not provided"}</DomainStatus></div>)}</div>
    </section>
  );
}

function RightsPanel({ track }: { track: ArtistTrackDetailData }) {
  return (
    <div className={styles.panelStack}>
      <div className={styles.rightsLayers}>
        <UnavailableRightsLayer title="Recording (Master) rights" description="Ownership of this exact sound recording requires a separate authoritative rights layer." />
        <UnavailableRightsLayer title="Composition (Publishing) rights" description="Writers and publishers for the underlying song require their own authoritative rights layer." />
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Current legacy data</p><h2>Existing rights records</h2><p>These records are preserved, but their combined percentage does not establish Recording or Composition completeness.</p></div><DomainStatus tone="warning">Not a readiness decision</DomainStatus></div>
        {track.rightsCredits.length ? <div className={styles.rightsTable} role="table" aria-label="Existing legacy rights records">
          <div role="row" className={styles.rightsHead}><span role="columnheader">Party</span><span role="columnheader">Role</span><span role="columnheader">Recorded share</span><span role="columnheader">Review</span></div>
          {track.rightsCredits.map(holder => <div role="row" className={styles.rightsRow} key={holder.id}><strong role="cell">{holder.name}</strong><span role="cell">{holder.role}</span><span role="cell">{holder.percentage}%</span><span role="cell"><DomainStatus tone={holder.reviewState === "approved" ? "info" : "warning"}>{holder.reviewState === "approved" ? "Recorded" : "Pending"}</DomainStatus></span></div>)}
        </div> : <DataState icon={ShieldAlert} title="No rights records are available" description="Recording and Composition rights must remain separate in the future rights workflow. Do not guess simply to complete this track." />}
      </section>
    </div>
  );
}

function LicensingPanel({ track }: { track: ArtistTrackDetailData }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Current offers</p><h2>Licensing</h2><p>These are the active options buyers can review when the track is Discoverable.</p></div><DomainStatus tone={track.licenseOptions.length ? "success" : "warning"}>{track.licenseOptions.length ? `${track.licenseOptions.length} active` : "Not configured"}</DomainStatus></div>
      {track.licenseOptions.length ? <div className={styles.licenseGrid}>{track.licenseOptions.map(option => <article key={option.id}><div><h3>{option.name}</h3><strong>{formatCurrency(option.price_override ?? option.base_price)}</strong></div><p>{option.terms_summary}</p><small>{option.exclusive ? "Exclusive negotiation path" : "Standard non-exclusive option"}</small></article>)}</div> : <DataState icon={FileAudio} title="No active license options" description="Configure an offer in the compatibility editor before this track can appear in Buyer discovery." />}
    </section>
  );
}

function UnavailableRightsLayer({ title, description }: { title: string; description: string }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Authoritative layer required</p><h2>{title}</h2><p>{description}</p></div><DomainStatus tone="warning">Unavailable</DomainStatus></div><div className={styles.notice}><ShieldAlert aria-hidden="true" /><div><strong>Backend dependency</strong><p>This layer cannot be inferred from the current generic rights split.</p></div></div></section>;
}

function DeferredPanel({ icon, title, description }: { icon: typeof Clock3; title: string; description: string }) {
  return <DataState icon={icon} title={title} description={description} />;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
