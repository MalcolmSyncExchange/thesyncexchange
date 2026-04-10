import { redirect } from "next/navigation";

import { requireSession } from "@/services/auth/session";

export default async function ArtistRootPage() {
  await requireSession("artist");
  redirect("/artist/dashboard");
}
