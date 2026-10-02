import Link from "next/link";
import { Headphones, Search } from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DiscoverPage() {
  return (
    <main>
      <PageHero
        eyebrow="Discover"
        title="Find music for the work in front of you."
        description="Search by artist, sound, mood, or genre. Preview a track before you choose a license."
      />
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <CardContent className="p-6 sm:p-8">
            <form action="/login" method="get" className="grid gap-4 md:grid-cols-[1fr,auto] md:items-end">
              <input type="hidden" name="redirectTo" value="/buyer/catalog" />
              <div className="space-y-2">
                <Label htmlFor="music-search">Search music by artist, track, genre, or mood</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="music-search" name="catalogQuery" className="h-12 pl-10" placeholder="Artist, track, or mood" />
                </div>
              </div>
              <Button type="submit" size="lg">Search music</Button>
            </form>
            <div className="mt-6 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
              <Headphones aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-medium">The live catalog is protected.</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Sign in with a buyer account to search, preview, and save current tracks. This keeps private catalog and account data behind the approved access rules.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card><CardContent className="p-6"><h2 className="text-xl font-semibold">New to The Sync Exchange?</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Create a buyer account, then set up the details needed for your workspace.</p><Button asChild className="mt-5"><Link href="/signup/buyer">Create buyer account</Link></Button></CardContent></Card>
          <Card><CardContent className="p-6"><h2 className="text-xl font-semibold">Already have an account?</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Log in to return to the catalog, favorites, orders, and license records you can use.</p><Button asChild variant="outline" className="mt-5"><Link href="/login?redirectTo=/buyer/catalog">Log in</Link></Button></CardContent></Card>
        </div>
      </section>
    </main>
  );
}
