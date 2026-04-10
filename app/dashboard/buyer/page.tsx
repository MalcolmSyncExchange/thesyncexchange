import { redirect } from "next/navigation";

import { requireSession } from "@/services/auth/session";

export default async function BuyerDashboardAliasPage() {
  await requireSession("buyer");
  redirect("/buyer/dashboard");
}
