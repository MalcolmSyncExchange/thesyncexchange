import { AnalyticsProvider } from "@/components/analytics/provider";
import { analyticsConfig } from "@/services/analytics/server";
import type { ReactNode } from "react";

import { ArtistWorkspaceShell } from "@/components/artist/artist-workspace-shell";
import { PreviewAudioProvider } from "@/components/audio/preview-audio-provider";
import { requireSession } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function ArtistLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("artist");
  return <AnalyticsProvider key={user.id} userId={user.id} enabled={!!analyticsConfig()}><PreviewAudioProvider><ArtistWorkspaceShell user={user}>{children}</ArtistWorkspaceShell></PreviewAudioProvider></AnalyticsProvider>;
}
