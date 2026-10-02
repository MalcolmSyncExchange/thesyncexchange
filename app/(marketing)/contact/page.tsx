import Link from "next/link";

import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage() {
  return (
    <main>
      <PageHero
        eyebrow="Contact & support"
        title="Tell us what you need."
        description="Choose a topic so your question can reach the right team. Do not include passwords, tax documents, or payment details."
        actions={<Button asChild variant="outline"><Link href="/faq">Read common questions</Link></Button>}
      />
      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.75fr,1.25fr] lg:px-8">
        <div>
          <h2 className="text-2xl font-semibold">How can we help?</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Choose artist support, buyer and licensing support, rights, account help, or a general question.</p>
          <p className="mt-6 text-sm leading-7 text-muted-foreground">This preview does not send a support request yet. Support routing remains an implementation dependency.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Contact The Sync Exchange</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="contact-topic">Topic</Label>
                <select id="contact-topic" name="topic" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option>Artist support</option>
                  <option>Buyer and licensing support</option>
                  <option>Rights issue</option>
                  <option>Account issue</option>
                  <option>General and partnerships</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name</Label>
                <Input id="contact-name" name="name" autoComplete="name" placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" name="email" type="email" autoComplete="email" placeholder="name@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-company">Company or artist name <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="contact-company" name="company" autoComplete="organization" placeholder="Company or artist name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea id="contact-message" name="message" placeholder="Tell us what you need help with." />
              </div>
              <Button type="button">Preview inquiry</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
