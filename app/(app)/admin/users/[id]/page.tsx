import { notFound } from "next/navigation";

import { AdminUserDetailView } from "@/components/admin-v2/users-view";
import { getAdminUserDetail } from "@/services/admin/users";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await getAdminUserDetail((await params).id);
  if (!detail) notFound();
  return <AdminUserDetailView detail={detail} />;
}
