import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | The Sync Exchange",
  description: "Learn how The Sync Exchange collects, uses, protects, and shares information across its music licensing marketplace."
};

const supportEmail = "Support@thesyncexchange.com";

export default function PrivacyPage() {
  return (
    <main className="bg-background text-foreground">
      <article className="mx-auto max-w-4xl px-6 py-20 sm:py-24 lg:px-8">
        <header className="border-b border-border pb-10">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="mt-6 text-base leading-7 text-muted-foreground">Last Updated: April 30, 2026</p>
        </header>

        <div className="mt-12 space-y-12 text-sm leading-7 text-muted-foreground sm:text-base">
          <PolicySection title="1. Introduction">
            <p>
              The Sync Exchange (&ldquo;The Sync Exchange,&rdquo; &ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates a digital music licensing marketplace that connects music creators,
              artists, rights holders, licensors, and content owners (&ldquo;Artists&rdquo;) with brands, agencies, studios, production companies, content creators, businesses, and other
              license buyers (&ldquo;Buyers&rdquo;).
            </p>
            <p>
              This Privacy Policy explains how we collect, use, store, disclose, and protect personal information when you access or use our website, platform, marketplace,
              dashboards, account features, payment flows, licensing tools, communications, and related services, collectively referred to as the &ldquo;Services.&rdquo;
            </p>
            <p>By accessing or using the Services, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with this Privacy Policy, you should not use the Services.</p>
            <p>
              This Privacy Policy applies to all users of the Services, including visitors, Artists, Buyers, administrators, invited team members, collaborators, and other users who interact with
              The Sync Exchange.
            </p>
          </PolicySection>

          <PolicySection title="2. Information We Collect">
            <p>We collect information in several ways, including information you provide directly, information collected automatically, information generated through use of the Services, and information received from third-party service providers.</p>

            <PolicySubsection title="2.1 Information You Provide Directly">
              <p>We may collect information that you provide when you create an account, complete onboarding, submit music, purchase a license, communicate with us, or otherwise use the Services. This may include:</p>
              <PolicyList
                items={[
                  "Full name",
                  "Email address",
                  "Account login credentials",
                  "Company name",
                  "Billing email",
                  "Role or account type, such as Artist, Buyer, admin, collaborator, or team member",
                  "Profile information",
                  "Business or organization details",
                  "Contact preferences",
                  "Support inquiries",
                  "Feedback, messages, or other communications you send to us",
                  "Information submitted through forms, dashboards, onboarding flows, account settings, or support channels"
                ]}
              />
            </PolicySubsection>

            <PolicySubsection title="2.2 Artist and Rights Holder Information">
              <p>If you use the Services as an Artist, rights holder, or licensor, we may collect information related to your music, catalog, rights, ownership, and licensing activity, including:</p>
              <PolicyList
                items={[
                  "Artist name, project name, or professional name",
                  "Track titles",
                  "Audio files, previews, stems, or other music-related assets",
                  "Cover artwork or visual assets",
                  "Metadata, including genre, mood, tempo, tags, descriptions, lyrics status, explicit content status, release information, and similar details",
                  "Ownership, publishing, master rights, split, collaborator, and rights holder information",
                  "Licensing preferences",
                  "Pricing information",
                  "Approval status",
                  "Submission history",
                  "License activity and transaction history",
                  "Payment or payout-related information where applicable"
                ]}
              />
              <p>You are responsible for ensuring that any information, music, metadata, rights details, or collaborator information you submit is accurate and that you have the necessary rights and authority to provide it.</p>
            </PolicySubsection>

            <PolicySubsection title="2.3 Buyer Information">
              <p>If you use the Services as a Buyer, we may collect information related to your licensing activity, including:</p>
              <PolicyList
                items={[
                  "Company or organization name",
                  "Billing email",
                  "License selections",
                  "Track purchase history",
                  "License type",
                  "Order history",
                  "Agreement downloads",
                  "Project or usage information if provided",
                  "Payment status",
                  "Checkout activity",
                  "Billing or invoice records made available through our payment processor"
                ]}
              />
            </PolicySubsection>

            <PolicySubsection title="2.4 Payment and Billing Information">
              <p>Payments are processed by third-party payment providers, including Stripe. We do not store full credit card numbers, CVV codes, or full payment card details on our own servers.</p>
              <p>We may collect or receive limited payment-related information from Stripe or other payment providers, such as:</p>
              <PolicyList
                items={[
                  "Stripe customer ID",
                  "Stripe checkout session ID",
                  "Payment intent ID",
                  "Transaction status",
                  "Billing email",
                  "Amount paid",
                  "Currency",
                  "Product, license, or order purchased",
                  "Invoice or receipt links",
                  "Last four digits of a payment card if made available by the payment processor",
                  "Payment method type",
                  "Refund or dispute status"
                ]}
              />
              <p>Your payment information is handled by Stripe and is subject to Stripe&rsquo;s own privacy policy and terms.</p>
            </PolicySubsection>

            <PolicySubsection title="2.5 Automatically Collected Information">
              <p>When you access or use the Services, we may automatically collect certain technical and usage information, including:</p>
              <PolicyList
                items={[
                  "IP address",
                  "Browser type and version",
                  "Device type",
                  "Operating system",
                  "Referring URL",
                  "Pages viewed",
                  "Features used",
                  "Date and time of access",
                  "Session information",
                  "Authentication status",
                  "Approximate location derived from IP address",
                  "Error logs",
                  "Performance data",
                  "Security and fraud prevention signals"
                ]}
              />
            </PolicySubsection>

            <PolicySubsection title="2.6 Cookies and Similar Technologies">
              <p>We may use cookies, local storage, session storage, pixels, and similar technologies to operate and improve the Services. These technologies may be used to:</p>
              <PolicyList
                items={[
                  "Keep you signed in",
                  "Maintain session security",
                  "Remember preferences",
                  "Support platform functionality",
                  "Understand usage patterns",
                  "Improve performance",
                  "Detect fraud or abuse",
                  "Support analytics and marketing if enabled"
                ]}
              />
              <p>You may control cookies through your browser settings, but disabling cookies may affect the functionality of the Services.</p>
            </PolicySubsection>

            <PolicySubsection title="2.7 Information from Third Parties">
              <p>We may receive information from third-party service providers and integrations, including:</p>
              <PolicyList
                items={[
                  "Supabase for authentication, database, storage, and session handling",
                  "Stripe for payment processing, billing, checkout, invoices, and receipts",
                  "Hosting and deployment providers such as Netlify or Vercel",
                  "Analytics providers, if enabled",
                  "Email providers, if used for transactional or account communications",
                  "Fraud prevention, security, or monitoring tools"
                ]}
              />
            </PolicySubsection>
          </PolicySection>

          <PolicySection title="3. How We Use Information">
            <p>We use the information we collect for legitimate business, operational, contractual, security, legal, and platform-related purposes, including to:</p>
            <PolicyList
              items={[
                "Provide, operate, maintain, and improve the Services",
                "Create and manage user accounts",
                "Authenticate users",
                "Process logins, password resets, email confirmations, and account updates",
                "Enable Artists to submit and manage music",
                "Enable Buyers to discover, purchase, and download licenses",
                "Generate, store, and deliver license agreements",
                "Process payments and manage order fulfillment",
                "Provide invoices, receipts, and billing records",
                "Display account, dashboard, order, and license information",
                "Communicate with you about your account, purchases, submissions, licenses, or support requests",
                "Send transactional messages, including password reset emails, confirmation emails, purchase receipts, and license delivery notices",
                "Provide customer support",
                "Maintain marketplace integrity",
                "Prevent fraud, abuse, unauthorized access, and illegal activity",
                "Monitor performance, debug errors, and improve platform reliability",
                "Enforce our terms, agreements, and policies",
                "Comply with legal, regulatory, tax, accounting, and contractual obligations",
                "Protect the rights, safety, and property of The Sync Exchange, our users, and others"
              ]}
            />
          </PolicySection>

          <PolicySection title="4. Legal Bases for Processing">
            <p>If you are located in the European Economic Area, United Kingdom, Switzerland, or another jurisdiction requiring a legal basis for processing personal information, we process personal information under one or more of the following bases:</p>
            <PolicyList
              items={[
                "Contractual necessity: to provide the Services, process transactions, manage accounts, and fulfill license agreements",
                "Legitimate interests: to operate, secure, improve, and market the Services, prevent fraud, and support business operations",
                "Consent: where required for certain communications, cookies, or optional processing",
                "Legal obligation: to comply with tax, accounting, law enforcement, regulatory, or other legal requirements"
              ]}
            />
          </PolicySection>

          <PolicySection title="5. How We Share Information">
            <p>We do not sell personal information.</p>
            <p>We may share information in the following circumstances:</p>
            <PolicySubsection title="5.1 Service Providers">
              <p>We may share information with vendors and service providers that help us operate the Services, including:</p>
              <PolicyList items={["Supabase for authentication, database, file storage, and backend infrastructure", "Stripe for payments, billing, checkout, invoices, receipts, and fraud prevention", "Hosting and deployment providers", "Email delivery providers", "Analytics and monitoring providers", "Customer support tools", "Security and fraud prevention providers"]} />
              <p>These providers are authorized to use information only as necessary to provide services to us and are subject to their own legal and contractual obligations.</p>
            </PolicySubsection>
            <PolicySubsection title="5.2 Marketplace Participants">
              <p>Because The Sync Exchange is a licensing marketplace, limited information may be shared between Artists and Buyers when reasonably necessary to complete or document a licensing transaction. For example:</p>
              <PolicyList items={["License agreements may include relevant Artist, rights holder, Buyer, company, track, license, and transaction information", "Buyers may receive information necessary to understand the licensed track and permitted usage", "Artists or rights holders may receive information necessary to understand purchases, license activity, and reporting"]} />
              <p>We limit marketplace participant sharing to what is reasonably necessary for marketplace operation, transaction fulfillment, licensing documentation, rights administration, and dispute resolution.</p>
            </PolicySubsection>
            <PolicySubsection title="5.3 Legal and Compliance Purposes">
              <p>We may disclose information if we believe it is necessary or appropriate to:</p>
              <PolicyList items={["Comply with applicable laws, regulations, subpoenas, court orders, legal processes, or government requests", "Enforce our terms, policies, licenses, or agreements", "Protect the rights, property, or safety of The Sync Exchange, users, third parties, or the public", "Detect, investigate, or prevent fraud, security incidents, illegal activity, or platform abuse", "Respond to claims or disputes"]} />
            </PolicySubsection>
            <PolicySubsection title="5.4 Business Transfers">
              <p>If The Sync Exchange is involved in a merger, acquisition, financing, reorganization, sale of assets, bankruptcy, or similar business transaction, information may be transferred as part of that transaction, subject to appropriate protections.</p>
            </PolicySubsection>
          </PolicySection>

          <PolicySection title="6. Data Storage and Security">
            <p>We use reasonable administrative, technical, and organizational measures designed to protect personal information from unauthorized access, loss, misuse, alteration, disclosure, or destruction.</p>
            <p>These measures may include:</p>
            <PolicyList items={["HTTPS encryption in transit", "Authentication and session controls", "Role-based access controls", "Limited access to sensitive systems", "Secure third-party infrastructure providers", "Environment variable and secret management", "Logging and monitoring", "Separation of public and server-only credentials"]} />
            <p>However, no method of transmission or storage is completely secure. We cannot guarantee absolute security.</p>
          </PolicySection>

          <PolicySection title="7. Data Retention">
            <p>We retain personal information for as long as reasonably necessary to provide the Services, operate our business, comply with legal obligations, resolve disputes, enforce agreements, and maintain accurate licensing and transaction records.</p>
            <p>Retention periods may vary depending on the type of information and the purpose for which it is used.</p>
            <p>For example:</p>
            <PolicyList items={["Account information may be retained while your account remains active", "Licensing agreements, transaction records, and payment records may be retained for legal, tax, accounting, audit, and rights administration purposes", "Support communications may be retained for customer service and dispute resolution", "Security logs may be retained for fraud prevention and platform protection"]} />
            <p>When information is no longer needed, we may delete, anonymize, or aggregate it.</p>
          </PolicySection>

          <PolicySection title="8. User Content and Music Submissions">
            <p>Artists and rights holders may upload music, artwork, metadata, and related materials to the Services.</p>
            <p>By submitting content, you understand that we may store, process, display, transmit, review, and make available such content as necessary to operate the marketplace, provide previews, support licensing, review submissions, generate agreements, and fulfill transactions.</p>
            <p>You should not submit personal information of third parties unless you have the right and authority to do so.</p>
          </PolicySection>

          <PolicySection title="9. License Agreements and Transaction Records">
            <p>The Sync Exchange may generate license agreements or transaction records based on information provided by Artists, Buyers, and platform systems. These records may include:</p>
            <PolicyList items={["Buyer name or company information", "Artist, track, and rights holder information", "License type", "Purchase date", "License price", "Order ID", "Agreement terms", "Download records", "Payment status"]} />
            <p>These records may be retained for legal, commercial, tax, audit, dispute resolution, and rights administration purposes.</p>
          </PolicySection>

          <PolicySection title="10. Account Management">
            <p>You may be able to access, update, or correct certain account information through your dashboard or settings page.</p>
            <p>Depending on available features, you may be able to:</p>
            <PolicyList items={["Update company information", "Update billing email", "Change password", "Request password reset", "Update email address", "Manage notification preferences", "View order history", "Download license agreements", "Manage billing through Stripe", "Log out of active sessions"]} />
            <p>Some changes, such as email address updates, may require confirmation.</p>
          </PolicySection>

          <PolicySection title="11. Your Privacy Rights">
            <p>Depending on your location, you may have certain rights regarding your personal information, including the right to:</p>
            <PolicyList items={["Access personal information we hold about you", "Correct inaccurate or incomplete information", "Request deletion of personal information", "Request restriction of processing", "Object to certain processing", "Request data portability", "Withdraw consent where processing is based on consent", "Opt out of certain communications", "Appeal a decision regarding a privacy request where applicable"]} />
            <p>To exercise privacy rights, contact us at:</p>
            <ContactEmail />
            <p>We may need to verify your identity before responding to certain requests.</p>
          </PolicySection>

          <PolicySection title="12. California Privacy Rights">
            <p>If you are a California resident, you may have rights under the California Consumer Privacy Act and California Privacy Rights Act, including the right to:</p>
            <PolicyList items={["Know what categories of personal information we collect, use, disclose, and share", "Request access to specific pieces of personal information", "Request deletion of personal information", "Request correction of inaccurate personal information", "Opt out of the sale or sharing of personal information", "Limit the use of sensitive personal information where applicable", "Not be discriminated against for exercising privacy rights"]} />
            <p>We do not sell personal information.</p>
            <p>To submit a California privacy request, contact:</p>
            <ContactEmail />
          </PolicySection>

          <PolicySection title="13. International Privacy Rights">
            <p>If you are located outside the United States, your information may be processed in the United States or other countries where we or our service providers operate.</p>
            <p>These countries may have data protection laws that differ from those in your jurisdiction. Where required, we use appropriate safeguards for international transfers.</p>
          </PolicySection>

          <PolicySection title="14. Email Communications">
            <p>We may send you transactional and service-related emails, including:</p>
            <PolicyList items={["Account confirmation emails", "Password reset emails", "Purchase receipts", "License delivery notices", "Security alerts", "Billing notices", "Important platform updates", "Support responses"]} />
            <p>You may not be able to opt out of certain transactional or security-related emails because they are necessary to provide the Services.</p>
            <p>If we send marketing emails, you may unsubscribe using the instructions in those emails or by contacting:</p>
            <ContactEmail />
          </PolicySection>

          <PolicySection title="15. Analytics and Tracking">
            <p>We may use analytics tools to understand how users interact with the Services, improve performance, and identify product issues.</p>
            <p>Analytics data may include device information, usage activity, page views, browser information, and approximate location. Where required by law, we will obtain consent before using certain analytics or tracking technologies.</p>
          </PolicySection>

          <PolicySection title="16. Third-Party Services and Links">
            <p>The Services may contain links to third-party websites, tools, payment pages, or services. We are not responsible for the privacy practices, security, content, or policies of third parties.</p>
            <p>Your use of third-party services, including Stripe, is subject to those third parties&rsquo; own terms and privacy policies.</p>
          </PolicySection>

          <PolicySection title="17. Data Accuracy">
            <p>You are responsible for keeping your account, billing, rights, and licensing information accurate and up to date.</p>
            <p>Artists and rights holders are responsible for ensuring that ownership, rights, split, collaborator, and licensing information submitted to the Services is accurate and authorized.</p>
          </PolicySection>

          <PolicySection title="18. Children’s Privacy">
            <p>The Services are not intended for children under 13 years of age, and we do not knowingly collect personal information from children under 13.</p>
            <p>If we learn that we have collected personal information from a child under 13 without appropriate consent, we will take reasonable steps to delete such information.</p>
          </PolicySection>

          <PolicySection title="19. Sensitive Information">
            <p>You should not submit sensitive personal information unless specifically requested and necessary for the Services.</p>
            <p>Sensitive information may include government identification numbers, health information, biometric information, precise geolocation, financial account credentials, or other highly sensitive data.</p>
          </PolicySection>

          <PolicySection title="20. Security Incidents">
            <p>If we become aware of a security incident affecting personal information, we will investigate and take appropriate steps. Where required by law, we will notify affected users, regulators, or other parties.</p>
          </PolicySection>

          <PolicySection title="21. Changes to This Privacy Policy">
            <p>We may update this Privacy Policy from time to time. When we update it, we will revise the &ldquo;Last Updated&rdquo; date above.</p>
            <p>If changes are material, we may provide additional notice, such as by email, platform notification, or prominent notice on the Services.</p>
            <p>Your continued use of the Services after an updated Privacy Policy becomes effective means you acknowledge the updated policy.</p>
          </PolicySection>

          <PolicySection title="22. Contact Us">
            <p>If you have questions, concerns, or requests related to this Privacy Policy or our privacy practices, contact us at:</p>
            <ContactEmail />
            <address className="not-italic">
              <p>The Sync Exchange</p>
              <p>Privacy Request</p>
              <ContactEmail />
            </address>
          </PolicySection>
        </div>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PolicySubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PolicyList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ContactEmail() {
  return (
    <p>
      <a href={`mailto:${supportEmail}`} className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-muted-foreground">
        {supportEmail}
      </a>
    </p>
  );
}
