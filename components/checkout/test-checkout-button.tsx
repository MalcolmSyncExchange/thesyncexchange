"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function TestCheckoutButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to start Stripe Checkout.");
      }

      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start Stripe Checkout.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="lg" onClick={handleCheckout} disabled={isLoading} className="w-full sm:w-auto">
        {isLoading ? "Redirecting to Stripe..." : "Buy License ($25)"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
