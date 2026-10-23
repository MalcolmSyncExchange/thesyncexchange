"use client";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { filterProperties, type BrowserEvent, type EventProperties } from "@/lib/analytics/schema";
import type { BrowserCapture } from "@/lib/analytics/triggers";
const Context = createContext<BrowserCapture>(() => {});
export function AnalyticsProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const capture = useCallback(<E extends BrowserEvent>(event: E, properties: EventProperties<E>) => {
    const safe = filterProperties(event, properties);
    if (!enabled || !safe) return;
    // No persistent identity, delayed queue, SDK, cookies, or browser metadata.
    // The endpoint rejects an old page's events after logout/account switching.
    // Keep only the origin locally: no-referrer can null the Origin CSRF header.
    void fetch("/api/analytics", { method: "POST", credentials: "same-origin", keepalive: true,
      referrerPolicy: "strict-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties: safe, expectedUserId: userId }) }).catch(() => {});
  }, [userId, enabled]);
  return <Context.Provider value={capture}>{children}</Context.Provider>;
}
export function useAnalytics() { return useContext(Context); }
