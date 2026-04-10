import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BuyerSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Buyer profile and company settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input defaultValue="Northframe Creative" />
          </div>
          <div className="space-y-2">
            <Label>Billing email</Label>
            <Input defaultValue="music@northframe.co" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
