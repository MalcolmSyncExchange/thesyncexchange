import { redirect } from "next/navigation";

import { requireSession } from "@/services/auth/session";

export default async function AdminRootPage() {
  await requireSession("admin");
  redirect("/admin/dashboard");
}
