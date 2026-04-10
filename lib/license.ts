import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/utils";
import { licenseTypes, tracks } from "@/lib/demo-data";

export function generateAgreementPlaceholder(orderId: string, trackId: string, licenseTypeId: string) {
  const track = tracks.find((item) => item.id === trackId);
  const license = licenseTypes.find((item) => item.id === licenseTypeId);
  const fee = license?.base_price || 0;

  return {
    orderId,
    trackTitle: track?.title || "Selected Track",
    artistName: track?.artist_name || "The Sync Exchange Artist",
    licenseName: license?.name || "License",
    agreementUrl: `${env.appUrl}/license-confirmation/${orderId}`,
    summary: [
      `License: ${license?.name || "Pending selection"}`,
      `Fee: ${formatCurrency(fee)}`,
      "Territory, term, and media language require legal review before production release."
    ]
  };
}

export interface AgreementArtifactInput {
  orderId: string;
  createdAt: string;
  trackTitle: string;
  artistName: string;
  licenseName: string;
  amountPaid: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  rightsHolders: Array<{
    name: string;
    roleType: string;
    ownershipPercent: number;
  }>;
}

export function getAgreementAccessUrl(orderId: string) {
  return `${env.appUrl}/api/orders/${orderId}/agreement`;
}

export function buildAgreementStoragePath(orderId: string) {
  return `orders/${orderId}/license-agreement.html`;
}

export function renderLicenseAgreementHtml(input: AgreementArtifactInput) {
  const rightsMarkup = input.rightsHolders.length
    ? input.rightsHolders
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

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Sync Exchange License Agreement</title>
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
      }
      h1, h2, h3, p {
        margin: 0;
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
        border: 1px solid #f59e0b33;
        background: #f59e0b14;
        border-radius: 10px;
        padding: 16px;
        color: #92400e;
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
      <p class="eyebrow">The Sync Exchange</p>
      <h1 class="headline">Sync License Agreement</h1>
      <p class="lede">
        This agreement artifact was generated automatically after payment confirmation. It packages the commercial record for the order below while final long-form legal language remains under counsel review.
      </p>

      <section class="grid">
        <div class="panel">
          <p class="label">Order</p>
          <p class="value">${escapeHtml(input.orderId)}</p>
        </div>
        <div class="panel">
          <p class="label">Generated</p>
          <p class="value">${escapeHtml(input.createdAt)}</p>
        </div>
        <div class="panel">
          <p class="label">Track</p>
          <p class="value">${escapeHtml(input.trackTitle)}</p>
        </div>
        <div class="panel">
          <p class="label">Artist</p>
          <p class="value">${escapeHtml(input.artistName)}</p>
        </div>
        <div class="panel">
          <p class="label">License</p>
          <p class="value">${escapeHtml(input.licenseName)}</p>
        </div>
        <div class="panel">
          <p class="label">Fee</p>
          <p class="value">${escapeHtml(formatCurrency(input.amountPaid, input.currency))}</p>
        </div>
        <div class="panel">
          <p class="label">Buyer</p>
          <p class="value">${escapeHtml(input.buyerName)}</p>
        </div>
        <div class="panel">
          <p class="label">Billing Contact</p>
          <p class="value">${escapeHtml(input.buyerEmail)}</p>
        </div>
      </section>

      <section class="section">
        <h2>Licensed Recording</h2>
        <p class="body-copy">
          The Sync Exchange confirms receipt of payment for the selected license tier and records the licensed composition and master metadata shown in this artifact.
        </p>
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

      <section class="section">
        <h2>Commercial Notes</h2>
        <p class="body-copy">
          Exclusive restrictions, term, territory, media scope, indemnities, and credit obligations remain subject to The Sync Exchange legal review workflow.
        </p>
      </section>

      <div class="notice">
        TODO: Legal review required before this generated artifact is used as the final production contract or countersigned legal instrument.
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
