"use client";
import { useRef, type ReactNode } from "react";
import { useAnalytics } from "./provider";
export function OnboardingInteraction({ children }: { children: ReactNode }) {
  const capture = useAnalytics(); const started = useRef(false);
  const start = () => { if (!started.current) { started.current = true; capture("onboarding_started", {}); } };
  return <div onChangeCapture={start} onSubmitCapture={start}>{children}</div>;
}
