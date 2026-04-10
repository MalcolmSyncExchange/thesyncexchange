import Link from "next/link";

import { ComplianceFlagActions } from "@/components/admin/compliance-flag-actions";
import { FlagSeverityBadge, FlagStatusBadge } from "@/components/shared/state-badges";
import { formatDateTime } from "@/lib/utils";
import { getAdminComplianceFlags } from "@/services/admin/queries";

export default async function CompliancePage() {
  const flags = await getAdminComplianceFlags();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Flagged content and compliance</h1>
      <div className="space-y-4">
        {flags.length ? flags.map((flag: any) => (
          <div key={flag.id} className="rounded-lg border border-border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/admin/tracks/${flag.track_id}`} className="font-medium hover:underline">
                    {flag.track_title || "Track"}
                  </Link>
                  <FlagStatusBadge status={flag.status} />
                  <FlagSeverityBadge severity={flag.severity} />
                </div>
                <p className="text-sm text-muted-foreground">{flag.flag_type}</p>
                <p className="text-sm text-muted-foreground">{flag.notes}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {flag.created_by_name || "Unknown reviewer"} • {formatDateTime(flag.created_at)}
                </p>
              </div>
              <ComplianceFlagActions flagId={flag.id} status={flag.status} />
            </div>
          </div>
        )) : <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">No compliance flags are open right now.</div>}
      </div>
    </div>
  );
}
