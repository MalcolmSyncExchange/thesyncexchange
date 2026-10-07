"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, FileText, Music2, ShieldCheck } from "lucide-react";

import { PreviewAudioButton } from "@/components/audio/preview-audio-provider";
import { Button } from "@/components/ui/button";
import { DomainStatus } from "@/components/ui/domain-status";
import { formatCurrency, formatDuration } from "@/lib/utils";
import type { ArtistTrackBuyerPreviewData } from "@/services/artist/catalog-contract";
import styles from "./artist-track-detail.module.css";

export function ArtistTrackBuyerPreview({ data }: { data: ArtistTrackBuyerPreviewData }) {
  const track = data.track;
  return (
    <div className={styles.previewPage} data-testid="artist-track-buyer-preview">
      <div className={styles.previewBanner}>
        <div><strong>Buyer Preview</strong><span>This view contains only buyer-visible track information.</span></div>
        <Button asChild variant="outline"><Link href={`/artist/tracks/${track.slug}`}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Exit Preview</Link></Button>
      </div>
      <main className={styles.buyerSurface}>
        <div className={styles.buyerCover}>{track.coverArtUrl ? <Image src={track.coverArtUrl} alt={`${track.title} cover`} fill priority sizes="(max-width: 720px) 100vw, 430px" className={styles.coverImage} /> : <Music2 aria-hidden="true" />}</div>
        <div className={styles.buyerContent}>
          <div className={styles.identityMeta}><DomainStatus tone={data.buyerVisibility.tone}>{data.buyerVisibility.label}</DomainStatus><span>{track.genre}{track.subgenre ? ` · ${track.subgenre}` : ""}</span></div>
          <h1>{track.title}</h1>
          <p className={styles.buyerArtist}>{track.artistName}</p>
          <div className={styles.buyerTags}>{track.moods.map(mood => <span key={mood}>{mood}</span>)}</div>
          <PreviewAudioButton track={{ id: track.id, slug: track.slug, title: track.title, artistName: track.artistName, artworkUrl: track.coverArtUrl, previewUrl: track.previewAudioUrl, waveformUrl: track.waveformUrl, durationSeconds: track.durationSeconds }} className={styles.buyerPlay} />
          <p className={styles.buyerDescription}>{track.description || "No public track description is available."}</p>
          <dl className={styles.buyerMetadata}><div><dt>BPM</dt><dd>{track.bpm}</dd></div><div><dt>Key</dt><dd>{track.musicalKey}</dd></div><div><dt>Duration</dt><dd>{formatDuration(track.durationSeconds)}</dd></div><div><dt>Vocals</dt><dd>{track.vocals ? "Vocals" : "Instrumental"}</dd></div></dl>
        </div>
      </main>
      <div className={styles.buyerLower}>
        <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Buyer-facing credits</p><h2>Rights credits</h2><p>Private contact information and internal review details are excluded.</p></div><ShieldCheck aria-hidden="true" /></div>{track.rightsCredits.length ? <div className={styles.creditList}>{track.rightsCredits.map(credit => <div key={credit.id}><span><strong>{credit.name}</strong><small>{credit.role}</small></span><b>{credit.percentage}%</b></div>)}</div> : <p className={styles.description}>No buyer-visible rights credits are available.</p>}</section>
        <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Available offers</p><h2>License options</h2><p>Buyers review the offer and authoritative terms before checkout.</p></div><FileText aria-hidden="true" /></div>{track.licenseOptions.length ? <div className={styles.creditList}>{track.licenseOptions.map(option => <div key={option.id}><span><strong>{option.name}</strong><small>{option.termsSummary}</small></span><b>{formatCurrency(option.price)}</b></div>)}</div> : <p className={styles.description}>No active license options are buyer-visible.</p>}</section>
      </div>
    </div>
  );
}
