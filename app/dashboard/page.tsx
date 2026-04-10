import { redirect } from "next/navigation";

import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function DashboardEntryPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  redirect(resolvePostAuthRedirect(user));
}
