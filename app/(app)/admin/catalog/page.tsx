import { requireSession } from "@/services/auth/session";
import { CatalogWorkbench } from "@/components/artist/catalog/catalog-workbench";
import { catalogQueueContext, reviewQueueHref } from "@/lib/admin/review-queue-navigation";

export default async function AdminCatalogManagement({ searchParams }: {
  searchParams: Promise<{ track?: string; status?: string; page?: string }>;
}) {
  await requireSession("admin");
  const { track, status, page } = await searchParams;
  const returnHref = track ? reviewQueueHref("catalog", catalogQueueContext(status, page)) : undefined;
  return <CatalogWorkbench key={track} track={track} admin returnHref={returnHref} />;
}
