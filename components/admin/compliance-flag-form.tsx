import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FLAG_SEVERITY_OPTIONS, FLAG_TYPE_OPTIONS } from "@/lib/taxonomy";
import { formatEnumLabel } from "@/lib/utils";
import { createComplianceFlagAction } from "@/services/admin/actions";

export function ComplianceFlagForm({ trackId }: { trackId: string }) {
  return (
    <form action={createComplianceFlagAction} className="space-y-4">
      <input type="hidden" name="trackId" value={trackId} />
      <div className="space-y-2">
        <Label htmlFor="flagType">Flag type</Label>
        <input
          id="flagType"
          name="flagType"
          list="flag-type-options"
          placeholder="Metadata mismatch"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <datalist id="flag-type-options">
          {FLAG_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="severity">Severity</Label>
        <select
          id="severity"
          name="severity"
          defaultValue="medium"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {FLAG_SEVERITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatEnumLabel(option)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="flagNotes">Notes</Label>
        <Textarea id="flagNotes" name="notes" placeholder="Describe the issue and the next review step." required />
      </div>
      <Button type="submit" size="sm">
        Create Flag
      </Button>
    </form>
  );
}
