import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Disc3, Globe2, Search, ShieldCheck, UploadCloud, Wallet } from "lucide-react";

import type { ArtistOnboardingValues, BuyerOnboardingValues } from "@/services/auth/onboarding";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buyerGenreOptions,
  buyerMoodOptions,
  buyerOnboardingSteps,
  buyerTypeOptions,
  industryTypeOptions,
  artistOnboardingSteps
} from "@/lib/validation/onboarding";
import { cn } from "@/lib/utils";
import type { ArtistOnboardingStep, BuyerOnboardingStep } from "@/types/models";

const selectClassName =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ArtistOnboardingFlow({
  step,
  values,
  error,
  saveAction,
  finishAction
}: {
  step: ArtistOnboardingStep;
  values: ArtistOnboardingValues;
  error?: string;
  saveAction: (formData: FormData) => Promise<void>;
  finishAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <OnboardingShell
      roleLabel="Artist onboarding"
      title="Set up your artist profile"
      description="Move from account creation into a rights-ready artist workspace with structured profile details, licensing context, and a clean path to your first upload."
      steps={artistOnboardingSteps}
      currentStepIndex={artistOnboardingSteps.findIndex((item) => item.id === step)}
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {error ? <FormError error={error} /> : null}
        {step === "basics" ? <ArtistBasicsStep action={saveAction} values={values} /> : null}
        {step === "profile" ? <ArtistProfileStep action={saveAction} values={values} /> : null}
        {step === "licensing" ? <ArtistLicensingStep action={saveAction} values={values} /> : null}
        {step === "first-track" ? <ArtistFirstTrackStep action={saveAction} values={values} /> : null}
        {step === "complete" ? <ArtistCompletionStep action={finishAction} values={values} /> : null}
      </div>
    </OnboardingShell>
  );
}

export function BuyerOnboardingFlow({
  step,
  values,
  error,
  saveAction,
  finishAction
}: {
  step: BuyerOnboardingStep;
  values: BuyerOnboardingValues;
  error?: string;
  saveAction: (formData: FormData) => Promise<void>;
  finishAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <OnboardingShell
      roleLabel="Buyer onboarding"
      title="Set up your buyer workspace"
      description="Establish the company, search context, and discovery preferences that shape a faster licensing workflow for your team."
      steps={buyerOnboardingSteps}
      currentStepIndex={buyerOnboardingSteps.findIndex((item) => item.id === step)}
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {error ? <FormError error={error} /> : null}
        {step === "basics" ? <BuyerBasicsStep action={saveAction} values={values} /> : null}
        {step === "profile" ? <BuyerProfileStep action={saveAction} values={values} /> : null}
        {step === "interests" ? <BuyerInterestsStep action={saveAction} values={values} /> : null}
        {step === "complete" ? <BuyerCompletionStep action={finishAction} values={values} /> : null}
      </div>
    </OnboardingShell>
  );
}

export function OnboardingRoleSelection({
  error,
  action
}: {
  error?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <OnboardingShell
      roleLabel="Role selection"
      title="Choose the side of the marketplace you’re joining"
      description="Artists continue into catalog setup and submission. Buyers continue into company setup, discovery preferences, and licensing workflow preparation."
      steps={[
        { id: "role", label: "Choose your role" },
        { id: "setup", label: "Complete setup" }
      ]}
      currentStepIndex={0}
    >
      <div className="mx-auto w-full max-w-4xl space-y-10">
        {error ? <FormError error={error} /> : null}
        <div className="space-y-4">
          <StepHeader
            eyebrow="Role selection"
            title="Start with the workflow that matches your first job to be done"
            description="You can always expand your account capabilities later. For now, choose the experience that gets you to value fastest."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Artist path" value="Profile, rights, uploads" />
            <MiniStat label="Buyer path" value="Company, search, licensing" />
            <MiniStat label="Resume later" value="Progress saved automatically" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RoleSelectionCard
            action={action}
            role="artist"
            icon={<Disc3 className="h-5 w-5" />}
            title="Continue as Artist"
            description="Set up your profile, licensing preferences, and first-track workflow."
            bullets={["Buyer-ready artist presentation", "Structured licensing setup", "Direct path into track submission"]}
          />
          <RoleSelectionCard
            action={action}
            role="buyer"
            icon={<Building2 className="h-5 w-5" />}
            title="Continue as Buyer"
            description="Set up your company profile, search preferences, and licensing workspace."
            bullets={["Search context for real briefs", "Billing and company profile", "Immediate path into catalog discovery"]}
          />
        </div>
      </div>
    </OnboardingShell>
  );
}

function ArtistBasicsStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: ArtistOnboardingValues;
}) {
  const hasAvatar = Boolean(values.avatarUrl);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="basics" />
      <StepHeader
        eyebrow="Step 1"
        title="Account basics"
        description="Start with the identity buyers and admins will see throughout your artist workspace."
      />
      <SurfaceSection>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={values.fullName} placeholder="Your full name" required className="h-11" />
          </Field>
          <Field label="Artist or stage name" htmlFor="artistName">
            <Input id="artistName" name="artistName" defaultValue={values.artistName} placeholder="Artist project name" required className="h-11" />
          </Field>
        </div>
        <Field label="Profile image URL" htmlFor="avatarUrl" optional>
          <Input id="avatarUrl" name="avatarUrl" defaultValue={values.avatarUrl} placeholder="https://..." className="h-11" />
        </Field>
        <InlineState
          title={hasAvatar ? "Profile image ready" : "No profile image yet"}
          description={
            hasAvatar
              ? "Your artist profile already has a visual anchor. You can still replace it later."
              : "Leave this blank for now if you want to move quickly. You can add profile media after setup."
          }
          tone={hasAvatar ? "ready" : "empty"}
          icon={<Globe2 className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions submitLabel="Continue to profile" pendingLabel="Saving basics..." />
    </form>
  );
}

function ArtistProfileStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: ArtistOnboardingValues;
}) {
  const hasLinks = Boolean(values.website || values.instagram || values.spotify || values.youtube);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="profile" />
      <StepHeader
        eyebrow="Step 2"
        title="Professional profile"
        description="Give supervisors and brand teams enough context to understand your sound, positioning, and creative lane."
      />
      <SurfaceSection>
        <Field label="Bio" htmlFor="bio">
          <Textarea
            id="bio"
            name="bio"
            defaultValue={values.bio}
            placeholder="Describe your sound, strengths, and the kinds of placements your catalog suits."
            required
            className="min-h-[140px]"
          />
        </Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={values.location} placeholder="City, State" required className="h-11" />
          </Field>
          <Field label="Website" htmlFor="website" optional>
            <Input id="website" name="website" defaultValue={values.website} placeholder="https://yourstudio.com" className="h-11" />
          </Field>
          <Field label="Instagram" htmlFor="instagram" optional>
            <Input id="instagram" name="instagram" defaultValue={values.instagram} placeholder="@artistname" className="h-11" />
          </Field>
          <Field label="Spotify" htmlFor="spotify" optional>
            <Input id="spotify" name="spotify" defaultValue={values.spotify} placeholder="https://open.spotify.com/..." className="h-11" />
          </Field>
        </div>
        <Field label="YouTube" htmlFor="youtube" optional>
          <Input id="youtube" name="youtube" defaultValue={values.youtube} placeholder="https://youtube.com/..." className="h-11" />
        </Field>
        <InlineState
          title={hasLinks ? "External links included" : "Links can come later"}
          description={
            hasLinks
              ? "Your public profile will have stronger context for admins and buyers reviewing your catalog."
              : "The essentials are your bio and location. Add external destinations later if you want to keep moving."
          }
          tone={hasLinks ? "ready" : "empty"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions backHref="/onboarding/artist?step=basics" submitLabel="Continue to licensing" pendingLabel="Saving profile..." />
    </form>
  );
}

function ArtistLicensingStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: ArtistOnboardingValues;
}) {
  const hasPreferences = Boolean(values.defaultLicensingPreferences);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="licensing" />
      <StepHeader
        eyebrow="Step 3"
        title="Licensing setup"
        description="Set the payout destination and capture any default licensing preferences you want the team to see early."
      />
      <SurfaceSection>
        <Field label="Payout email" htmlFor="payoutEmail">
          <Input
            id="payoutEmail"
            name="payoutEmail"
            type="email"
            defaultValue={values.payoutEmail}
            placeholder="royalties@example.com"
            required
            className="h-11"
          />
        </Field>
        <Field label="Default licensing preferences" htmlFor="defaultLicensingPreferences" optional>
          <Textarea
            id="defaultLicensingPreferences"
            name="defaultLicensingPreferences"
            defaultValue={values.defaultLicensingPreferences}
            placeholder="Example: open to digital campaigns, broadcast, and trailer placements. Final legal terms remain subject to review."
            className="min-h-[132px]"
          />
        </Field>
        <InlineState
          title={hasPreferences ? "Licensing posture saved" : "No default licensing posture saved yet"}
          description={
            hasPreferences
              ? "This gives reviewers and future catalog workflows a clearer starting point."
              : "Leave this open if you prefer to configure licensing on a track-by-track basis after setup."
          }
          tone={hasPreferences ? "ready" : "empty"}
          icon={<Wallet className="h-4 w-4" />}
        />
        <InlineState
          title="Business review required"
          description="Final licensing preference taxonomy and contractual behavior still need legal and commercial review before production use."
          tone="info"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions
        backHref="/onboarding/artist?step=profile"
        submitLabel="Continue to first track"
        pendingLabel="Saving licensing setup..."
      />
    </form>
  );
}

function ArtistFirstTrackStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: ArtistOnboardingValues;
}) {
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="first-track" />
      <StepHeader
        eyebrow="Step 4"
        title="Choose your next move"
        description="Finish setup and either move straight into your first upload or land in the dashboard with the profile work complete."
      />
      <SurfaceSection className="space-y-4">
        <RadioOption
          name="firstTrackChoice"
          value="upload"
          defaultChecked={values.firstTrackChoice === "upload"}
          title="Upload first track now"
          description="Finish setup, then head directly into the submission workflow with no extra clicks."
          icon={<UploadCloud className="h-4 w-4" />}
        />
        <RadioOption
          name="firstTrackChoice"
          value="later"
          defaultChecked={values.firstTrackChoice !== "upload"}
          title="Skip for later"
          description="Finish setup first and return from the artist dashboard when the catalog is ready."
          icon={<Disc3 className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions backHref="/onboarding/artist?step=licensing" submitLabel="Review completion" pendingLabel="Saving preference..." />
    </form>
  );
}

function ArtistCompletionStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: ArtistOnboardingValues;
}) {
  const primaryDestination = values.firstTrackChoice === "upload" ? "submit" : "dashboard";

  return (
    <CompletionSection
      eyebrow="Setup complete"
      title="Your artist workspace is ready for real catalog work"
      description="Identity, profile, and licensing context are now in place. The next move is either getting music into review or landing in the dashboard with a clean foundation."
      stats={[
        { label: "Profile", value: values.artistName || "Artist identity ready" },
        { label: "Payout", value: values.payoutEmail || "Stored" },
        { label: "Next move", value: primaryDestination === "submit" ? "Upload first track" : "Open dashboard" }
      ]}
      checklist={[
        "Full artist identity and public profile context",
        "Payout destination and initial licensing posture",
        "Saved setup state for future catalog and submission work"
      ]}
    >
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="destination" value={primaryDestination} />
          <FormSubmitButton pendingLabel="Finishing setup...">
            {primaryDestination === "submit" ? "Upload first track now" : "Go to artist dashboard"}
          </FormSubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="destination" value="dashboard" />
          <FormSubmitButton variant="outline" pendingLabel="Opening dashboard...">
            Go to artist dashboard
          </FormSubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="destination" value="submit" />
          <FormSubmitButton variant="ghost" pendingLabel="Opening submit flow...">
            Upload first track
          </FormSubmitButton>
        </form>
      </div>
    </CompletionSection>
  );
}

function BuyerBasicsStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: BuyerOnboardingValues;
}) {
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="basics" />
      <StepHeader
        eyebrow="Step 1"
        title="Account basics"
        description="Start with the person and company details that anchor your buying workspace."
      />
      <SurfaceSection>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={values.fullName} placeholder="Your full name" required className="h-11" />
          </Field>
          <Field label="Company name" htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              defaultValue={values.companyName}
              placeholder="Agency, brand, studio, or company"
              required
              className="h-11"
            />
          </Field>
        </div>
        <InlineState
          title={values.companyName ? "Company context added" : "No company context yet"}
          description={
            values.companyName
              ? "This gives the buyer workspace a clear operational anchor from the start."
              : "Add the company name now so saved tracks, orders, and billing all start from the right context."
          }
          tone={values.companyName ? "ready" : "empty"}
          icon={<Building2 className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions submitLabel="Continue to buyer profile" pendingLabel="Saving basics..." />
    </form>
  );
}

function BuyerProfileStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: BuyerOnboardingValues;
}) {
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="profile" />
      <StepHeader
        eyebrow="Step 2"
        title="Buyer profile"
        description="Tell us how your team buys music so the dashboard and catalog feel grounded in real working patterns."
      />
      <SurfaceSection>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Buyer type" htmlFor="buyerType">
            <select id="buyerType" name="buyerType" defaultValue={values.buyerType} className={selectClassName} required>
              <option value="">Select buyer type</option>
              {buyerTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry type" htmlFor="industryType">
            <select id="industryType" name="industryType" defaultValue={values.industryType} className={selectClassName} required>
              <option value="">Select industry type</option>
              {industryTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Billing email" htmlFor="billingEmail">
          <Input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={values.billingEmail}
            placeholder="billing@company.com"
            required
            className="h-11"
          />
        </Field>
        <InlineState
          title={values.buyerType || values.industryType ? "Buyer context is taking shape" : "Buyer context still blank"}
          description="These signals shape discovery, saved search context, and the operational language used across the buyer workspace."
          tone={values.buyerType || values.industryType ? "ready" : "empty"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions
        backHref="/onboarding/buyer?step=basics"
        submitLabel="Continue to music interests"
        pendingLabel="Saving buyer profile..."
      />
    </form>
  );
}

function BuyerInterestsStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: BuyerOnboardingValues;
}) {
  const hasPreferences = values.genres.length > 0 || values.moods.length > 0;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="step" value="interests" />
      <StepHeader
        eyebrow="Step 3"
        title="Music interests"
        description="These signals help shape discovery and give the platform context for what your team is actually chasing."
      />
      <SurfaceSection className="space-y-8">
        <CheckboxGrid name="genres" label="Preferred genres" options={buyerGenreOptions} selected={values.genres} />
        <CheckboxGrid name="moods" label="Preferred moods" options={buyerMoodOptions} selected={values.moods} />
        {!hasPreferences ? (
          <InlineState
            title="No preferences selected yet"
            description="Choose at least one genre and one mood so discovery can start from real creative intent instead of a blank slate."
            tone="empty"
            icon={<Search className="h-4 w-4" />}
          />
        ) : (
          <InlineState
            title="Search preferences are taking shape"
            description={`Current mix: ${values.genres.length} genre${values.genres.length === 1 ? "" : "s"} and ${values.moods.length} mood${values.moods.length === 1 ? "" : "s"} selected.`}
            tone="ready"
            icon={<Search className="h-4 w-4" />}
          />
        )}
        <Field label="Intended use" htmlFor="intendedUse" optional>
          <Textarea
            id="intendedUse"
            name="intendedUse"
            defaultValue={values.intendedUse}
            placeholder="Example: premium lifestyle spots, cinematic branded content, or recurring series promo."
            className="min-h-[132px]"
          />
        </Field>
        <InlineState
          title="Business review required"
          description="Final interest taxonomy, weighting, and recommendation behavior should still be refined with product and commercial review."
          tone="info"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </SurfaceSection>
      <FormActions backHref="/onboarding/buyer?step=profile" submitLabel="Review completion" pendingLabel="Saving interests..." />
    </form>
  );
}

function BuyerCompletionStep({
  action,
  values
}: {
  action: (formData: FormData) => Promise<void>;
  values: BuyerOnboardingValues;
}) {
  return (
    <CompletionSection
      eyebrow="Setup complete"
      title="Your buyer workspace is ready for discovery and licensing"
      description="Company, billing, and search context are now in place. From here, you can land in the dashboard or move directly into the approved catalog."
      stats={[
        { label: "Company", value: values.companyName || "Buyer profile ready" },
        { label: "Buyer type", value: values.buyerType || "Configured" },
        { label: "Preferences", value: `${values.genres.length} genres • ${values.moods.length} moods` }
      ]}
      checklist={[
        "Company and billing context for future orders",
        "Role and industry signals for buyer-specific workflows",
        "Saved discovery preferences to guide catalog search"
      ]}
    >
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="destination" value="dashboard" />
          <FormSubmitButton pendingLabel="Opening dashboard...">Go to buyer dashboard</FormSubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="destination" value="catalog" />
          <FormSubmitButton variant="outline" pendingLabel="Opening catalog...">
            Browse catalog now
          </FormSubmitButton>
        </form>
      </div>
    </CompletionSection>
  );
}

function StepHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p> : null}
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SurfaceSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6 rounded-lg border border-border bg-background/80 p-6 sm:p-7", className)}>{children}</div>;
}

function CompletionSection({
  eyebrow,
  title,
  description,
  stats,
  checklist,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats: Array<{ label: string; value: string }>;
  checklist: string[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.25rem]">{title}</h2>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((item) => (
          <MiniStat key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-background/80 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">What’s in place</p>
            <div className="mt-4 space-y-3">
              {checklist.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <span className="leading-6">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="max-w-sm rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Next move</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The setup is complete. Choose the handoff that gets you into real platform work fastest.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function FormActions({
  backHref,
  submitLabel,
  pendingLabel
}: {
  backHref?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
      <div>
        {backHref ? (
          <Button asChild variant="ghost">
            <Link href={backHref}>Back</Link>
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Progress is saved after each step.</span>
        )}
      </div>
      <FormSubmitButton pendingLabel={pendingLabel}>{submitLabel}</FormSubmitButton>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Optional</span> : null}
      </Label>
      {children}
    </div>
  );
}

function CheckboxGrid({
  name,
  label,
  options,
  selected
}: {
  name: string;
  label: string;
  options: string[];
  selected: string[];
}) {
  const selectedSet = new Set(selected);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <label key={option} className="group cursor-pointer">
            <input type="checkbox" name={name} value={option} defaultChecked={selectedSet.has(option)} className="peer sr-only" />
            <span className="flex min-h-[60px] items-center rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-foreground group-hover:bg-muted/40">
              {option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RadioOption({
  name,
  value,
  defaultChecked,
  title,
  description,
  icon
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <label className="group cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="flex items-start gap-4 rounded-md border border-border bg-background p-5 transition-colors peer-checked:border-accent peer-checked:bg-accent/10 group-hover:bg-muted/40">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          {icon}
        </span>
        <span className="space-y-1.5">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-sm leading-6 text-muted-foreground">{description}</span>
        </span>
      </span>
    </label>
  );
}

function RoleCard({
  href,
  icon,
  title,
  description,
  bullets
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-background/80 p-6 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-foreground">{icon}</span>
          <div>
            <p className="text-lg font-semibold text-foreground">{title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-6 space-y-2">
        {bullets.map((bullet) => (
          <div key={bullet} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent/10 text-accent">
              <CheckCircle2 className="h-3 w-3" />
            </span>
            <span>{bullet}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function RoleSelectionCard({
  action,
  role,
  icon,
  title,
  description,
  bullets
}: {
  action: (formData: FormData) => Promise<void>;
  role: "artist" | "buyer";
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <form action={action}>
      <input type="hidden" name="role" value={role} />
      <button
        type="submit"
        className="group block w-full rounded-lg border border-border bg-card p-6 text-left shadow-panel transition-colors hover:border-foreground/20 hover:bg-card/80"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-foreground">{icon}</div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{role === "artist" ? "Artist path" : "Buyer path"}</p>
          <h3 className="mt-3 text-xl font-semibold text-foreground">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="mt-6 space-y-2">
          {bullets.map((bullet) => (
            <div key={bullet} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent/10 text-accent">
                <CheckCircle2 className="h-3 w-3" />
              </span>
              <span>{bullet}</span>
            </div>
          ))}
        </div>
      </button>
    </form>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/80 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function InlineState({
  title,
  description,
  tone,
  icon
}: {
  title: string;
  description: string;
  tone: "ready" | "empty" | "info";
  icon: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-4 text-sm",
        tone === "ready" && "border-accent/20 bg-accent/10 text-foreground",
        tone === "empty" && "border-border bg-muted/30 text-foreground",
        tone === "info" && "border-border bg-background text-foreground"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md",
          tone === "ready" && "bg-accent/15 text-accent",
          tone === "empty" && "bg-muted text-muted-foreground",
          tone === "info" && "bg-muted text-foreground"
        )}
      >
        {icon}
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FormError({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-5 py-4">
      <p className="text-sm font-medium text-destructive">We couldn&apos;t save this step</p>
      <p className="mt-1 text-sm leading-6 text-destructive">{error}</p>
    </div>
  );
}
