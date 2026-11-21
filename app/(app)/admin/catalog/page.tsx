import { requireSession } from "@/services/auth/session";
import { CatalogWorkbench } from "@/components/artist/catalog/catalog-workbench";
import { catalogQueueContext, reviewQueueHref } from "@/lib/admin/review-queue-navigation";

export default async function AdminCatalogManagement({ searchParams }: {
  searchParams: Promise<{ track?: string; status?: string; page?: string; from?: string }>;
}) {
  await requireSession("admin");
  const { track, status, page, from } = await searchParams;
  const returnHref = track ? reviewQueueHref(from === "track-queue" ? "track" : "catalog", catalogQueueContext(status, page), track) : undefined;
  return <CatalogWorkbench key={track} track={track} admin returnHref={returnHref} returnLabel={from === "track-queue" ? "Back to Track Submissions" : undefined} />;
}
