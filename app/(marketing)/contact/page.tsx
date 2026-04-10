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
        eyebrow="Contact"
        title="Start a licensing or platform conversation."
        description="Reach out about artist submissions, buyer access, enterprise licensing support, or partnership conversations."
      />
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Contact The Sync Exchange</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="name@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input placeholder="Company or artist name" />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea placeholder="Tell us about your catalog, project, or licensing need." />
              </div>
              <Button type="button">Send Inquiry</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
