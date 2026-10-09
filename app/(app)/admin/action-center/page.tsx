import { AdminActionCenter } from "@/components/admin-v2/operations-view";
import { getAdminOperationsSnapshot } from "@/services/admin/operations";

export default async function AdminActionCenterPage() {
  const snapshot = await getAdminOperationsSnapshot();
  return <AdminActionCenter snapshot={snapshot} />;
}
