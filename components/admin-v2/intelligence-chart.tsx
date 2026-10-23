"use client";
import { useState } from "react";
import type { SECReadModels } from "@/lib/analytics/intelligence/read-models";
import { confidence, metricText } from "@/lib/analytics/intelligence/dashboard";
export function IntelligenceChart({ series }: { series: SECReadModels["series"] }) {
  const metric = series[0]?.metrics[0]?.id ?? "track_preview_started";
  const [active, setActive] = useState<number | null>(null);
  const points = series.map(bucket => ({ date: bucket.range.startInclusive, card: bucket.metrics.find(item => item.id === metric)! }));
  const max = Math.max(1, ...points.map(p => p.card.metric.value ?? 0));
  const selected = active === null ? null : points[active];
  return <section className="rounded-xl border bg-card p-6 space-y-4" aria-label="Marketplace activity time series">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Activity over time</h2><p>{series[0]?.metrics[0]?.label ?? "Unavailable"}</p></div>
    <p className="text-sm text-muted-foreground">UTC date → · Count ↑ · Focus or hover each observation. Gaps represent unavailable evidence.</p>
    <div className="overflow-x-auto"><div className="flex h-48 items-end gap-1 border-b" style={{ minWidth: points.length * 28 }}>
      {points.map((point,i) => <button key={point.date} type="button" className="relative flex h-full flex-1 min-w-6 items-end rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`${point.date}: ${metricText(point.card)}; ${confidence(point.card)}; previous: ${point.card.comparison?.metric.value ?? "Unavailable"}`} aria-describedby={active === i ? "intelligence-point" : undefined} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const sibling = e.key === "ArrowRight" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling; (sibling as HTMLElement | null)?.focus(); } }}>
        <span className={point.card.metric.value === null ? "w-full border border-dashed border-muted-foreground" : "w-full rounded-t bg-primary/70"} style={{ height: point.card.metric.value === null ? 8 : Math.max(2, point.card.metric.value / max * 100) + "%" }} />
      </button>)}
    </div></div>
    <div id="intelligence-point" role="tooltip" aria-live="polite" className="min-h-12 text-sm">{selected ? `${selected.date} · ${selected.card.label}: ${metricText(selected.card)} · ${confidence(selected.card)}${selected.card.comparison ? ` · Previous: ${selected.card.comparison.metric.value ?? "Unavailable"} · ${selected.card.comparison.metric.state} · ${selected.card.comparison.coverage.finalized ? "Finalized" : "Provisional"}` : ""}` : "Hover or focus a date to inspect its actual value."}</div>
    <div className="flex justify-between text-xs text-muted-foreground"><span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span></div>
    {!points.some(p => (p.card.metric.value ?? 0) > 0) && <p className="text-sm">No positive activity observed. Review availability before interpreting zero activity.</p>}
  </section>;
}
