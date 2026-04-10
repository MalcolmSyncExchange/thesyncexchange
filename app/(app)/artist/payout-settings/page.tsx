import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PayoutSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Payout settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Royalty payout profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Payout email</Label>
            <Input defaultValue="maya@sync.exchange" />
          </div>
          <div className="space-y-2">
            <Label>Tax / entity placeholder</Label>
            <Input defaultValue="TODO: legal + finance review" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
