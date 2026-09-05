import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { getArtistCatalogDiagnostics, getArtistWorkspaceData, type ArtistCatalogDiagnosticResult } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistCatalogPage({
  searchParams
}: {
  searchParams?: { catalogDebug?: string | string[]; submitted?: string | string[] };
}) {
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);
  const catalogDebugEnabled = getSearchParamValue(searchParams?.catalogDebug) === "1";
  const diagnostics = catalogDebugEnabled ? await getArtistCatalogDiagnostics(user.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">My catalog</h1>
        <p className="mt-2 text-muted-foreground">Review approved tracks, drafts, and submissions awaiting admin decision.</p>
      </div>
      {diagnostics ? (
        <ArtistCatalogDiagnosticPanel
          diagnostics={diagnostics}
          workspaceTrackCount={tracks.length}
          finalRenderedTrackCount={tracks.length}
        />
      ) : null}
      <CatalogBrowser tracks={tracks} basePath="/artist/tracks" />
    </div>
  );
}

function getSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function ArtistCatalogDiagnosticPanel({
  diagnostics,
  workspaceTrackCount,
  finalRenderedTrackCount
}: {
  diagnostics: ArtistCatalogDiagnosticResult;
  workspaceTrackCount: number;
  finalRenderedTrackCount: number;
}) {
  const activeFilterState = {
    query: "",
    genre: "all",
    mood: "all",
    licenseType: "all",
    vocalProfile: "all",
    explicitFilter: "all",
    priceBand: "all",
    minBpm: "",
    maxBpm: "",
    sort: "featured",
    layout: "grid"
  };
  const payload = {
    marker: "SYNC_ARTIST_CATALOG_DIAGNOSTIC_V1",
    authenticatedUserId: diagnostics.authenticatedUserId,
    clientMode: diagnostics.clientMode,
    tracksOnly: diagnostics.tracksOnly,
    rightsHoldersOnly: diagnostics.rightsHoldersOnly,
    trackLicenseOptionsOnly: diagnostics.trackLicenseOptionsOnly,
    licenseTypesOnly: diagnostics.licenseTypesOnly,
    fullNestedCatalogQuery: diagnostics.fullNestedCatalogQuery,
    finalWorkspaceTrackCount: workspaceTrackCount,
    finalRenderedTrackCount,
    activeFilterState
  };

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-foreground" aria-label="Artist catalog diagnostics">
      <p className="mb-3 font-semibold">SYNC_ARTIST_CATALOG_DIAGNOSTIC_V1</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  );
}
