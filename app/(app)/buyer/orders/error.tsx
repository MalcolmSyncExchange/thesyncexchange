"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function PurchaseError({ retry }: { retry: () => void }) {
  return (
    <section role="alert" className="rounded-lg border border-border p-6">
      <h1 className="text-2xl font-semibold">
        Purchase records could not load
      </h1>
      <p className="my-4 text-muted-foreground">
        Try again in a moment. No purchase record has been changed.
      </p>
      <Button onClick={retry} className="min-h-11">
        Try again
      </Button>
      <Link
        href="/buyer/orders"
        className="ml-4 inline-flex min-h-11 items-center underline"
      >
        My Purchases
      </Link>
    </section>
  );
}
