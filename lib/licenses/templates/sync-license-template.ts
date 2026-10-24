import { renderUnicodeAgreementPdf } from "./unicode-agreement-pdf.ts";
import { formatCurrency } from "../../utils.ts";
import type { PurchaseSchedule } from "@/services/licensing/purchases";

const FALLBACK_TEMPLATE_VERSION = "TSE-SYNC-v1";

export type GeneratedLicenseTermsSnapshot = {
  purchase?: PurchaseSchedule;
  purchaseHash?: string;
  pdfSha256?: string;
  htmlSha256?: string;
  templateVersion?: string;
  agreementNumber: string;
  agreementStatus: "generated" | "failed";
  orderId: string;
  purchaseDate: string;
  effectiveDate: string;
  buyer: {
    userId: string;
    legalName: string;
    companyName: string | null;
    email: string;
  };
  licensor: {
    platformName: string;
    entityName: string;
    displayName: string;
  };
  track: {
    id: string;
    title: string;
    artistName: string;
    rightsHolders: Array<{
      name: string;
      roleType: string;
      ownershipPercent: number;
    }>;
  };
  license: {
    typeId: string | null;
    typeSlug: string | null;
    typeName: string;
    termsSummary: string;
    pricePaidCents: number;
    currency: string;
    territory: string;
    termLength: string;
    permittedMedia: string[];
    exclusivity: string;
    restrictions: string[];
    creditRequirements: string | null;
    grantText: string;
    ownershipReservation: string;
    transferRestriction: string;
    terminationTerms: string;
    governingLaw: string;
    legalReviewRequired: boolean;
  };
  stripe: {
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
  };
  payment?: {
    paymentMode: "test" | "live";
    releaseMode: "local" | "preview" | "production_beta" | "production_live";
    livemode: boolean;
    commercialRightsGranted: boolean;
  };
};

export function renderSyncLicenseAgreementPdf(snapshot: GeneratedLicenseTermsSnapshot) {
  return renderUnicodeAgreementPdf(snapshot);
}

export function formatAgreementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function renderSyncLicenseAgreementHtml(snapshot: GeneratedLicenseTermsSnapshot) {
  const brandLogoUrl = "/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png";
  const watermarkUrl = "/brand/the-sync-exchange/watermark/Watermark.png";
  const rightsMarkup = snapshot.track.rightsHolders.length
    ? snapshot.track.rightsHolders
        .map(
          (holder) => `
            <tr>
              <td>${escapeHtml(holder.name)}</td>
              <td>${escapeHtml(holder.roleType)}</td>
              <td>${holder.ownershipPercent}%</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="3">Rights holder details were not available when this agreement was generated.</td>
      </tr>
    `;
  const permittedMediaMarkup = snapshot.license.permittedMedia.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const restrictionsMarkup = snapshot.license.restrictions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const feePaid = formatCurrency(snapshot.license.pricePaidCents / 100, snapshot.license.currency);
  const effectiveDate = formatAgreementDate(snapshot.effectiveDate);
  const purchaseDate = formatAgreementDate(snapshot.purchaseDate);
  const templateVersion = getTemplateVersion(snapshot);
  const testOnly = isTestOnlyAgreement(snapshot);
  const agreementDescription = testOnly
    ? "This document records a Stripe sandbox transaction for product testing. It is not a commercial license and grants no commercial rights."
    : "This license agreement was generated automatically after verified Stripe payment. It records the commercial rights granted for this purchase and the secure delivery entitlement for the buyer identified below.";
  const buyerDisplay = snapshot.buyer.companyName
    ? `${snapshot.buyer.companyName} (${snapshot.buyer.legalName})`
    : snapshot.buyer.legalName;
  const legalReviewNotice = snapshot.license.legalReviewRequired
    ? `
      <div class="notice">
        ${
          testOnly
            ? "This test artifact is not final production legal language, does not record enforceable commercial terms, and grants no delivery or exploitation rights."
            : "Attorney review required before this agreement template is treated as final production legal language. This artifact records the commercial terms of the purchase and the delivery entitlement for the buyer."
        }
      </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Sync Exchange Sync License Agreement</title>
    <style>
      body {
        font-family: Inter, Arial, sans-serif;
        background: #f7f9fb;
        color: #111827;
        margin: 0;
        padding: 32px;
      }
      .sheet {
        max-width: 960px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #d8dee8;
        border-radius: 12px;
        padding: 40px;
        position: relative;
        overflow: hidden;
      }
      h1, h2, h3, p {
        margin: 0;
      }
      ul {
        margin: 12px 0 0 18px;
        padding: 0;
      }
      li {
        margin-top: 6px;
      }
      .brand-mark {
        display: block;
        width: 220px;
        max-width: 100%;
        height: auto;
      }
      .watermark {
        position: absolute;
        right: 36px;
        bottom: 36px;
        width: 240px;
        max-width: 36%;
        opacity: 0.08;
        pointer-events: none;
      }
      .content {
        position: relative;
        z-index: 1;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: #6b7280;
      }
      .headline {
        margin-top: 12px;
        font-size: 32px;
        line-height: 1.1;
      }
      .lede {
        margin-top: 16px;
        color: #4b5563;
        line-height: 1.6;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 28px;
      }
      .panel {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 16px;
      }
      .label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #6b7280;
      }
      .value {
        margin-top: 8px;
        font-size: 16px;
        font-weight: 600;
      }
      .section {
        margin-top: 32px;
      }
      .body-copy {
        margin-top: 12px;
        line-height: 1.7;
        color: #374151;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 16px;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
        padding: 12px 8px;
        font-size: 14px;
      }
      .notice {
        margin-top: 28px;
        border: 1px solid rgba(245, 158, 11, 0.2);
        background: rgba(245, 158, 11, 0.08);
        border-radius: 10px;
        padding: 16px;
        color: #92400e;
      }
      .test-only-banner {
        margin: 24px 0;
        border: 3px solid #b91c1c;
        background: #fee2e2;
        color: #7f1d1d;
        padding: 16px;
        text-align: center;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      @media print {
        body {
          background: #ffffff;
          padding: 0;
        }
        .sheet {
          border: none;
          border-radius: 0;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <img class="watermark" src="${watermarkUrl}" alt="" />
      <div class="content">
        <img class="brand-mark" src="${brandLogoUrl}" alt="The Sync Exchange" />
        ${testOnly ? '<div class="test-only-banner">TEST — NOT A COMMERCIAL LICENSE</div>' : ""}
        <p class="eyebrow">The Sync Exchange</p>
        <h1 class="headline">Sync License Agreement</h1>
        <p class="lede">
          ${escapeHtml(agreementDescription)}
        </p>

        <section class="grid">
          <div class="panel">
            <p class="label">Agreement Number</p>
            <p class="value">${escapeHtml(snapshot.agreementNumber)}</p>
          </div>
          <div class="panel">
            <p class="label">Effective Date</p>
            <p class="value">${escapeHtml(effectiveDate)}</p>
          </div>
          <div class="panel">
            <p class="label">Purchase Date</p>
            <p class="value">${escapeHtml(purchaseDate)}</p>
          </div>
          <div class="panel">
            <p class="label">Template Version</p>
            <p class="value">${escapeHtml(templateVersion)}</p>
          </div>
          <div class="panel">
            <p class="label">Payment Mode</p>
            <p class="value">${escapeHtml(snapshot.payment?.paymentMode || "legacy / unclassified")}</p>
          </div>
          <div class="panel">
            <p class="label">Commercial Rights Granted</p>
            <p class="value">${snapshot.payment?.commercialRightsGranted === false ? "No" : "Yes"}</p>
          </div>
          <div class="panel">
            <p class="label">Order</p>
            <p class="value">${escapeHtml(snapshot.orderId)}</p>
          </div>
          <div class="panel">
            <p class="label">Buyer</p>
            <p class="value">${escapeHtml(buyerDisplay)}</p>
          </div>
          <div class="panel">
            <p class="label">Billing Contact</p>
            <p class="value">${escapeHtml(snapshot.buyer.email)}</p>
          </div>
          <div class="panel">
            <p class="label">Licensor</p>
            <p class="value">${escapeHtml(snapshot.licensor.displayName)}</p>
          </div>
          <div class="panel">
            <p class="label">Track</p>
            <p class="value">${escapeHtml(snapshot.track.title)}</p>
          </div>
          <div class="panel">
            <p class="label">Artist</p>
            <p class="value">${escapeHtml(snapshot.track.artistName)}</p>
          </div>
          <div class="panel">
            <p class="label">License</p>
            <p class="value">${escapeHtml(snapshot.license.typeName)}</p>
          </div>
          <div class="panel">
            <p class="label">Fee Paid</p>
            <p class="value">${escapeHtml(feePaid)}</p>
          </div>
          <div class="panel">
            <p class="label">Territory</p>
            <p class="value">${escapeHtml(snapshot.license.territory)}</p>
          </div>
          <div class="panel">
            <p class="label">Term</p>
            <p class="value">${escapeHtml(snapshot.license.termLength)}</p>
          </div>
        </section>

        ${snapshot.purchase ? `<section class="section"><h2>Exact accepted legal document — ${escapeHtml(snapshot.purchase.terms.version)}</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(snapshot.purchase.terms.body)}</pre><h2>Immutable accepted transaction and acceptance receipt</h2><p>Purchase SHA-256: ${escapeHtml(snapshot.purchaseHash || "")}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(JSON.stringify(snapshot.purchase, null, 2))}</pre><p>Authenticated buyer acceptance records declared identity and authority. It is not a rightsholder signature or cryptographic signature.</p></section>` : ""}
        <section class="section">
          <h2>Licensed Recording</h2>
          <p class="body-copy">
            This agreement covers the recording identified as <strong>${escapeHtml(snapshot.track.title)}</strong> by <strong>${escapeHtml(snapshot.track.artistName)}</strong> under the purchased license tier <strong>${escapeHtml(snapshot.license.typeName)}</strong>.
          </p>
        </section>

        <section class="section">
          <h2>License Grant</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.grantText)}</p>
        </section>

        <section class="section">
          <h2>Permitted Media</h2>
          <ul>${permittedMediaMarkup}</ul>
        </section>

        <section class="section">
          <h2>Restrictions</h2>
          <ul>${restrictionsMarkup}</ul>
        </section>

        <section class="section">
          <h2>Transfer / Assignment</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.transferRestriction)}</p>
        </section>

        <section class="section">
          <h2>Ownership and Reservation of Rights</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.ownershipReservation)}</p>
        </section>

        <section class="section">
          <h2>Termination and Breach</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.terminationTerms)}</p>
        </section>

        <section class="section">
          <h2>Rights Holders</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Ownership</th>
              </tr>
            </thead>
            <tbody>
              ${rightsMarkup}
            </tbody>
          </table>
        </section>

        ${
          snapshot.license.creditRequirements
            ? `
        <section class="section">
          <h2>Credit</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.creditRequirements)}</p>
        </section>
        `
            : ""
        }

        <section class="section">
          <h2>Governing Law</h2>
          <p class="body-copy">${escapeHtml(snapshot.license.governingLaw)}</p>
        </section>

        <section class="section">
          <h2>Acceptance</h2>
          <p class="body-copy">${
            testOnly
              ? "This test artifact cannot be accepted, signed, or relied upon as a commercial license. No commercial rights are granted."
              : "Execution and signature language requires final legal review before this automated agreement template is treated as a countersigned legal instrument."
          }</p>
        </section>

        ${legalReviewNotice}
      </div>
    </main>
  </body>
</html>`;
}

function getTemplateVersion(snapshot: GeneratedLicenseTermsSnapshot) { return snapshot.templateVersion || FALLBACK_TEMPLATE_VERSION; }
function isTestOnlyAgreement(snapshot: GeneratedLicenseTermsSnapshot) { return snapshot.payment?.paymentMode === "test" || snapshot.payment?.commercialRightsGranted === false || snapshot.purchase?.licenseContract?.approval.mode === "synthetic" || Boolean(snapshot.purchase?.terms.approvalReference.toUpperCase().startsWith("SYNTHETIC")); }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
