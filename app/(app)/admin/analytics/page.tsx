import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { getAdminAnalytics } from "@/services/admin/queries";

export default async function AnalyticsPage() {
  const analytics = await getAdminAnalytics();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Analytics overview</h1>
      <div className="grid gap-6 md:grid-cols-3">
        {[
          ["Approved catalog", analytics.conversionLabel, "Approved tracks relative to the full track base."],
          ["Average order value", formatCurrency(analytics.averageOrderValue), "Live order value across recorded license activity."],
          ["Approval velocity", analytics.approvalVelocity, "Current review queue pressure based on pending submissions."]
        ].map(([title, value, copy]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
              <p className="mt-3 text-sm text-muted-foreground">{copy}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
