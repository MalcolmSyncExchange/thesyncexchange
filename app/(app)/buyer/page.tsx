import { redirect } from "next/navigation";

import { requireSession } from "@/services/auth/session";

export default async function BuyerRootPage() {
  await requireSession("buyer");
  redirect("/buyer/dashboard");
}
