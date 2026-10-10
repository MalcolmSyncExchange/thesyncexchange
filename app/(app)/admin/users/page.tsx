import { AdminUsersDirectory } from "@/components/admin-v2/users-view";
import { getAdminUserDirectory } from "@/services/admin/users";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const users = await getAdminUserDirectory(await searchParams);
  return <AdminUsersDirectory directory={users} />;
}
