import { AdminOverview } from "@/components/admin-v2/operations-view";
import { getAdminOperationsSnapshot } from "@/services/admin/operations";

export default async function AdminDashboardPage() {
  const snapshot = await getAdminOperationsSnapshot();
  return <AdminOverview snapshot={snapshot} />;
}
