import {
  ANALYTICS_CONTRACT_VERSION, FUNNELS, numberMetric, sourceMetric, unavailableMetric,
  type FunnelInput, type FunnelObservation, type Metric, type SourceState
} from "./contracts.ts";
import type { EventName } from "../schema.ts";

type StepResult = { event: FunnelObservation["event"]; actors: Metric<number>; matchedAttempts: Metric<number>; observedEvents: Metric<number> };
type TransitionResult = { from: FunnelObservation["event"]; to: FunnelObservation["event"];
  converted: Metric<number>; conversionPercent: Metric<number>; attemptConversionPercent: Metric<number>;
  dropped: Metric<number>; dropOffPercent: Metric<number>; medianSeconds: Metric<number> };
export type FunnelReport = { version: typeof ANALYTICS_CONTRACT_VERSION; funnel: FunnelInput["funnel"];
  steps: StepResult[]; transitions: TransitionResult[]; overallConversionPercent: Metric<number>;
  overallAttemptConversionPercent: Metric<number>; completionMedianSeconds: Metric<number> };

type Attempt = { actorId: string; events: FunnelObservation[]; trackId?: string; orderId?: string; submissionAttemptId?: string };
const unavailable = (state: SourceState) => sourceMetric(state);
const milliseconds = (value: string) => Date.parse(value);
const median = (values: number[]): Metric<number> => {
  if (!values.length) return unavailableMetric("not_applicable");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return numberMetric(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
};
const percent = (numerator: number, denominator: number): Metric<number> =>
  denominator === 0 ? unavailableMetric("not_applicable") : numberMetric(100 * numerator / denominator);

function validWindow(window: FunnelInput["window"]): boolean {
  const { startInclusive, endExclusive, observedThrough, maxStepLagMs } = window;
  return [startInclusive, endExclusive, observedThrough].every(value => Number.isFinite(milliseconds(value))) &&
    milliseconds(startInclusive) < milliseconds(endExclusive) && milliseconds(endExclusive) <= milliseconds(observedThrough) &&
    Number.isFinite(maxStepLagMs) && maxStepLagMs > 0;
}

function canAdvance(attempt: Attempt, event: FunnelObservation, maxStepLagMs: number): boolean {
  const previous = attempt.events.at(-1)!;
  const lag = milliseconds(event.occurredAt) - milliseconds(previous.occurredAt);
  if (lag <= 0 || lag > maxStepLagMs) return false;
  if (attempt.trackId && event.trackId && attempt.trackId !== event.trackId) return false;
  if (attempt.orderId && event.orderId && attempt.orderId !== event.orderId) return false;
  if (attempt.submissionAttemptId && event.submissionAttemptId && attempt.submissionAttemptId !== event.submissionAttemptId) return false;
  return true;
}

/** Calculate observed, ordered journeys. Each later event advances at most one entry attempt. */
export function calculateFunnel(input: FunnelInput): FunnelReport {
  const definition = FUNNELS[input.funnel];
  const steps: EventName[] = [...definition.steps];
  const source: SourceState = input.source !== "available" ? input.source :
    !steps.every(step => input.instrumentedEvents.includes(step)) ? "unavailable_instrumentation" :
    !validWindow(input.window) ? "insufficient_evidence" : "available";
  if (source !== "available") return {
    version: ANALYTICS_CONTRACT_VERSION, funnel: input.funnel,
    steps: steps.map(event => ({ event, actors: unavailable(source), matchedAttempts: unavailable(source), observedEvents: unavailable(source) })),
    transitions: steps.slice(1).map((to, index) => ({ from: steps[index], to,
      converted: unavailable(source), conversionPercent: unavailable(source), attemptConversionPercent: unavailable(source), dropped: unavailable(source),
      dropOffPercent: unavailable(source), medianSeconds: unavailable(source) })),
    overallConversionPercent: unavailable(source), overallAttemptConversionPercent: unavailable(source), completionMedianSeconds: unavailable(source)
  };

  const start = milliseconds(input.window.startInclusive);
  const end = milliseconds(input.window.endExclusive);
  const through = milliseconds(input.window.observedThrough);
  const byId = new Map<string, FunnelObservation>();
  let conflictingId = false;
  for (const event of input.observations) {
    if (event.actorRole !== definition.role || event.environment !== input.environment ||
      (!input.includeTest && event.isTest) || (!input.includeInternal && event.isInternal) ||
      (input.cohortActorIds && !input.cohortActorIds.has(event.actorId)) || !steps.includes(event.event)) continue;
    const time = milliseconds(event.occurredAt);
    if (!Number.isFinite(time) || time > through) continue;
    const previous = byId.get(event.eventId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) conflictingId = true;
    else byId.set(event.eventId, event);
  }
  if (conflictingId) return calculateFunnel({ ...input, source: "insufficient_evidence" });
  const events = [...byId.values()].sort((a, b) => milliseconds(a.occurredAt) - milliseconds(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const attempts: Attempt[] = [];
  const observed = steps.map(step => events.filter(event => event.event === step && milliseconds(event.occurredAt) >= start).length);
  for (const event of events) {
    const index = steps.indexOf(event.event);
    if (index === 0) {
      const time = milliseconds(event.occurredAt);
      if (time >= start && time < end) attempts.push({ actorId: event.actorId, events: [event],
        trackId: event.trackId, orderId: event.orderId, submissionAttemptId: event.submissionAttemptId });
      continue;
    }
    const target = attempts.find(attempt => attempt.actorId === event.actorId && attempt.events.length === index &&
      canAdvance(attempt, event, input.window.maxStepLagMs));
    if (!target) continue;
    target.events.push(event);
    target.trackId ||= event.trackId;
    target.orderId ||= event.orderId;
    target.submissionAttemptId ||= event.submissionAttemptId;
  }

  const actorSets = steps.map((_, index) => new Set(attempts.filter(attempt => attempt.events.length > index).map(attempt => attempt.actorId)));
  const stepResults = steps.map((event, index) => ({ event, actors: numberMetric(actorSets[index].size),
    matchedAttempts: numberMetric(attempts.filter(attempt => attempt.events.length > index).length),
    observedEvents: numberMetric(observed[index]) }));
  const transitions = steps.slice(1).map((to, index) => {
    const fromCount = actorSets[index].size;
    const toCount = actorSets[index + 1].size;
    const perActor = new Map<string, number>();
    for (const attempt of attempts.filter(item => item.events.length > index + 1)) {
      const seconds = (milliseconds(attempt.events[index + 1].occurredAt) - milliseconds(attempt.events[index].occurredAt)) / 1000;
      perActor.set(attempt.actorId, Math.min(perActor.get(attempt.actorId) ?? Infinity, seconds));
    }
    const fromAttempts = attempts.filter(attempt => attempt.events.length > index).length;
    const toAttempts = attempts.filter(attempt => attempt.events.length > index + 1).length;
    return { from: steps[index], to, converted: numberMetric(toCount), conversionPercent: percent(toCount, fromCount),
      attemptConversionPercent: percent(toAttempts, fromAttempts),
      dropped: numberMetric(fromCount - toCount), dropOffPercent: percent(fromCount - toCount, fromCount),
      medianSeconds: median([...perActor.values()]) };
  });
  const completionByActor = new Map<string, number>();
  for (const attempt of attempts.filter(item => item.events.length === steps.length)) {
    const seconds = (milliseconds(attempt.events.at(-1)!.occurredAt) - milliseconds(attempt.events[0].occurredAt)) / 1000;
    completionByActor.set(attempt.actorId, Math.min(completionByActor.get(attempt.actorId) ?? Infinity, seconds));
  }
  return { version: ANALYTICS_CONTRACT_VERSION, funnel: input.funnel, steps: stepResults, transitions,
    overallConversionPercent: percent(actorSets.at(-1)!.size, actorSets[0].size),
    overallAttemptConversionPercent: percent(attempts.filter(item => item.events.length === steps.length).length, attempts.length),
    completionMedianSeconds: median([...completionByActor.values()]) };
}
