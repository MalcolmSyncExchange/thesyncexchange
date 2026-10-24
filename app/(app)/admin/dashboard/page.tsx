import { secRequest } from "@/services/admin/sec";
import { SECOverview,type SECOverviewData } from "@/components/admin-v2/sec-overview";
import { AdminOverview } from "@/components/admin-v2/operations-view";
import { getAdminOperationsSnapshot } from "@/services/admin/operations";
import { getAdminPaymentReadiness } from "@/services/admin/payment-readiness";

export default async function AdminDashboardPage() {
  const scope=await secRequest({operation:"context"}).catch(()=>null) as {capabilities?:string[]}|null;
  const evidence=await secRequest({operation:"dashboard"}).catch(()=>null) as SECOverviewData|null;
  if(!scope?.capabilities?.includes("full_admin"))return <SECOverview initialData={evidence}/>;
  const [snapshot, readiness] = await Promise.all([getAdminOperationsSnapshot(), getAdminPaymentReadiness()]);
  return <AdminOverview snapshot={snapshot} readiness={readiness} operatingEvidence={<SECOverview initialData={evidence}/>}/>;
}
