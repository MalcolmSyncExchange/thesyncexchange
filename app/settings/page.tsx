import { redirect } from "next/navigation";

import { getSessionUser } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsAliasPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "buyer") {
    redirect("/buyer/settings");
  }

  if (user.role === "artist") {
    redirect("/artist/profile");
  }

  if (user.role === "admin") {
    redirect("/admin/dashboard");
  }

  redirect("/dashboard");
}
