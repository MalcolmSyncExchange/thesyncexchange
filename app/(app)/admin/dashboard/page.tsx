import { AdminOverview } from "@/components/admin-v2/operations-view";
import { getAdminOperationsSnapshot } from "@/services/admin/operations";
import { getAdminPaymentReadiness } from "@/services/admin/payment-readiness";

export default async function AdminDashboardPage() {
  const [snapshot, readiness] = await Promise.all([getAdminOperationsSnapshot(), getAdminPaymentReadiness()]);
  return <AdminOverview snapshot={snapshot} readiness={readiness} />;
}
