import { DataTable } from "@/components/tables/data-table";
import { getAdminUsers } from "@/services/admin/queries";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();
  const rows = users.map((user: any) => [user.full_name, user.email, user.role, String(user.created_at).slice(0, 10)]);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">User management</h1>
      <DataTable columns={["Name", "Email", "Role", "Created"]} rows={rows} />
    </div>
  );
}
