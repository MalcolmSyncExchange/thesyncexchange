import { Button } from "@/components/ui/button";
import { updateComplianceFlagStatusAction } from "@/services/admin/actions";

export function ComplianceFlagActions({
  flagId,
  status
}: {
  flagId: string;
  status: string;
}) {
  const nextStatus = status === "open" ? "resolved" : "open";

  return (
    <form action={updateComplianceFlagStatusAction}>
      <input type="hidden" name="flagId" value={flagId} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button size="sm" variant={status === "open" ? "outline" : "secondary"}>
        {status === "open" ? "Resolve" : "Reopen"}
      </Button>
    </form>
  );
}
