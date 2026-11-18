import { requireSession } from "@/services/auth/session";
import { LicenseWorkspace } from "@/components/licensing/license-workspace";
export const dynamic = "force-dynamic";
export default async function LicensesPage() { await requireSession("artist"); return <LicenseWorkspace role="artist"/>; }
