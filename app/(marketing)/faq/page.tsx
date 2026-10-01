import Link from "next/link";

import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";

const questions = [
  ["What does “Clear it” mean?", "It means reviewing the rights information, availability, price, scope, and terms tied to the offered license. It is not a promise that every right has been independently verified or legally guaranteed."],
  ["What rights do artists need?", "Artists must provide recording and composition information separately and resolve required issues before a track can become ready to license."],
  ["Can artists upload covers or sampled music?", "Those tracks follow their own approved rights paths. Artists can save a draft instead of guessing when information is unresolved."],
  ["What does a buyer purchase?", "A buyer purchases the offered license for a stated use. The authoritative terms for that offer control what is allowed."],
  ["Where is a completed license kept?", "After verified payment and fulfillment, the purchase-time license and order record belong in the buyer workspace."],
  ["Can one account be used for buyer and artist work?", "The product is designed around one person and one account. Access to each workspace still depends on the roles and permissions actually granted."]
];

export default function FaqPage() {
  return (
    <main>
      <PageHero
        eyebrow="FAQ"
        title="Clear answers before you move forward."
        description="Choose a topic. Contact support if your question is about a specific track, right, or license."
      />
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="divide-y divide-border rounded-lg border border-border">
          {questions.map(([question, answer]) => (
            <details key={question} className="group p-5 sm:p-6">
              <summary className="cursor-pointer list-none pr-8 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">{question}</summary>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
        <Button asChild className="mt-8"><Link href="/contact">Contact support</Link></Button>
      </section>
    </main>
  );
}
