import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getArtistFinance } from "@/services/artist/finance";
import { requireSession } from "@/services/auth/session";

export default async function PayoutSettingsPage() {
  const user = await requireSession("artist");
  const finance = await getArtistFinance(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Payout settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Royalty payout profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Payout email</Label>
              <Input defaultValue={finance.payout_email || "Not provided"} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Tax / entity name</Label>
              <Input defaultValue={finance.legal_entity || "Not provided"} readOnly />
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
            This view reflects the current payout contact on file. Tax collection, payout verification, and finance-specific controls should be confirmed as part of launch operations before handling live royalty disbursements.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
