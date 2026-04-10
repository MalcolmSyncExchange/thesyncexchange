import type { ReactNode } from "react";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert, Users2, Waves } from "lucide-react";

import { ReviewQueueCard } from "@/components/admin/review-queue-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { OrderStatusBadge } from "@/components/shared/state-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getAdminDashboardData } from "@/services/admin/queries";
import type { AdminFlagSeverity } from "@/types/models";

const severityMeta: Record<AdminFlagSeverity, { label: string; tone: string; barTone: string }> = {
  critical: {
    label: "Critical",
    tone: "text-rose-700 dark:text-rose-300",
    barTone: "bg-rose-500"
  },
  high: {
    label: "High",
    tone: "text-orange-700 dark:text-orange-300",
    barTone: "bg-orange-500"
  },
  medium: {
    label: "Medium",
    tone: "text-amber-700 dark:text-amber-300",
    barTone: "bg-amber-500"
  },
  low: {
    label: "Low",
    tone: "text-zinc-700 dark:text-zinc-300",
    barTone: "bg-zinc-500"
  }
};

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();
  const liveRatio = data.totalTracks ? Math.round((data.approvedTracks / data.totalTracks) * 100) : 0;
  const flagSummaryTotal = data.flagSummary.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card/80 p-6 shadow-panel">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="border-accent/20 bg-accent/10 text-accent">
              Admin operations
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Keep submissions moving, protect rights, and maintain catalog trust.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              The moderation queue, compliance pressure, and order activity are surfaced together here so the team can
              spot blockers early and keep buyers moving without introducing avoidable risk.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[440px]">
            <DashboardPulse
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Queue attention"
              value={String(data.pendingReviews)}
              detail={data.pendingReviews ? "Submissions waiting for a decision" : "No pending submissions"}
            />
            <DashboardPulse
              icon={<ShieldAlert className="h-4 w-4" />}
              label="Open flags"
              value={String(data.openFlags)}
              detail={data.openFlags ? "Compliance items need follow-through" : "No active compliance blockers"}
            />
            <DashboardPulse
              icon={<Waves className="h-4 w-4" />}
              label="Live catalog"
              value={`${liveRatio}%`}
              detail={`${data.approvedTracks} of ${data.totalTracks} tracks approved`}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Platform users" value={String(data.totalUsers)} change="Artists, buyers, and admins in one operating view" />
        <StatCard title="Total tracks" value={String(data.totalTracks)} change={`${data.approvedTracks} approved and buyer-facing`} />
        <StatCard
          title="Pending reviews"
          value={String(data.pendingReviews)}
          change={data.pendingReviews ? "Queue requires moderation attention" : "Review queue is clear"}
        />
        <StatCard title="Orders" value={String(data.totalOrders)} change={`${formatCurrency(data.grossVolume)} in processed license value`} />
        <StatCard
          title="Open flags"
          value={String(data.openFlags)}
          change={data.openFlags ? "Compliance follow-up still active" : "Compliance queue is stable"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Queue requiring attention</CardTitle>
              <CardDescription>
                Prioritized by open flags, split gaps, and reviewer activity so the riskiest submissions rise first.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/review-queue">
                Open queue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.pendingTracks.length ? (
              data.pendingTracks.map((track: (typeof data.pendingTracks)[number]) => <ReviewQueueCard key={track.id} track={track} compact />)
            ) : (
              <EmptyState
                title="The review queue is clear."
                description="New submissions will surface here as soon as artists publish them for review."
                href="/admin/tracks"
                cta="Open track management"
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance pressure</CardTitle>
              <CardDescription>Severity counts across all currently open flags.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium text-muted-foreground">Active issues</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{flagSummaryTotal}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {flagSummaryTotal
                    ? "Use the queue and track records to resolve rights, metadata, or policy blockers before approval."
                    : "No open compliance items are currently putting pressure on the moderation workflow."}
                </p>
              </div>

              <div className="space-y-4">
                {data.flagSummary.map((item: (typeof data.flagSummary)[number]) => {
                  const meta = severityMeta[item.severity];
                  const percent = flagSummaryTotal ? Math.round((item.count / flagSummaryTotal) * 100) : 0;

                  return (
                    <div key={item.severity} className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className={`font-medium ${meta.tone}`}>{meta.label}</span>
                        <span className="text-muted-foreground">
                          {item.count} {item.count === 1 ? "issue" : "issues"}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${meta.barTone}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button asChild variant="ghost" className="w-full justify-between">
                <Link href="/admin/compliance">
                  Review compliance queue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operating posture</CardTitle>
              <CardDescription>Quick signals for where the admin team should lean next.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PostureRow
                icon={<Users2 className="h-4 w-4" />}
                title="User footprint"
                detail={`${data.totalUsers} platform accounts currently active in the system.`}
              />
              <PostureRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Catalog trust"
                detail={
                  data.approvedTracks
                    ? `${data.approvedTracks} approved tracks are available to buyers right now.`
                    : "No tracks are approved yet, so buyer discovery depends on the moderation queue."
                }
              />
              <PostureRow
                icon={<AlertTriangle className="h-4 w-4" />}
                title="Next move"
                detail={
                  data.pendingReviews
                    ? "Work down the pending queue first so approvals and compliance decisions stay close to submission time."
                    : data.openFlags
                      ? "The submission queue is clear, so the best use of time is clearing remaining compliance items."
                      : "Moderation is stable. This is a good moment to review featured placements and recent orders."
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Recent order activity</CardTitle>
            <CardDescription>Fresh license activity and current order state from the buyer side of the platform.</CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/orders">Open orders</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.recentOrders.length ? (
            data.recentOrders.map((order: (typeof data.recentOrders)[number]) => (
              <div key={order.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{order.track_title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.license_name} licensed by {order.buyer_name}
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <p className="text-base font-semibold text-foreground">{formatCurrency(order.amount_paid)}</p>
                  <OrderStatusBadge status={order.order_status} />
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="No order activity yet."
              description="Orders will appear here once buyers begin licensing tracks from the approved catalog."
              href="/admin/orders"
              cta="Open order management"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardPulse({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/80 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function PostureRow({
  icon,
  title,
  detail
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  href,
  cta
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild variant="ghost" className="mt-4 px-0">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}
