import { formatCurrency } from "../../utils.ts";

export type GeneratedLicenseTermsSnapshot = {
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
};

export function renderSyncLicenseAgreementPdf(snapshot: GeneratedLicenseTermsSnapshot) {
  const lines = buildAgreementDocumentLines(snapshot);
  return buildSimplePdf(lines);
}

export function renderSyncLicenseAgreementHtml(snapshot: GeneratedLicenseTermsSnapshot) {
  const brandLogoUrl = "/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png";
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
  const buyerDisplay = snapshot.buyer.companyName
    ? `${snapshot.buyer.companyName} (${snapshot.buyer.legalName})`
    : snapshot.buyer.legalName;
  const legalReviewNotice = snapshot.license.legalReviewRequired
    ? `
      <div class="notice">
        Attorney review required before this agreement template is treated as final production legal language. This artifact records the commercial terms of the purchase and the delivery entitlement for the buyer.
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
        <p class="eyebrow">The Sync Exchange</p>
        <h1 class="headline">Sync License Agreement</h1>
        <p class="lede">
          This license agreement was generated automatically after verified Stripe payment. It records the commercial rights granted for this purchase and the secure delivery entitlement for the buyer identified below.
        </p>

        <section class="grid">
          <div class="panel">
            <p class="label">Agreement Number</p>
            <p class="value">${escapeHtml(snapshot.agreementNumber)}</p>
          </div>
          <div class="panel">
            <p class="label">Effective Date</p>
            <p class="value">${escapeHtml(snapshot.effectiveDate)}</p>
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
          <p class="body-copy">${escapeHtml(snapshot.license.transferRestriction)}</p>
        </section>

        <section class="section">
          <h2>Ownership Reservation</h2>
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

        ${legalReviewNotice}
      </div>
    </main>
  </body>
</html>`;
}

function buildAgreementDocumentLines(snapshot: GeneratedLicenseTermsSnapshot) {
  const rightsHolderLines = snapshot.track.rightsHolders.length
    ? snapshot.track.rightsHolders.flatMap((holder) =>
        wrapPdfLine(`${holder.name} - ${holder.roleType} - ${holder.ownershipPercent}%`, 88)
      )
    : ["Rights holder details were not available when this agreement was generated."];
  const feePaid = formatCurrency(snapshot.license.pricePaidCents / 100, snapshot.license.currency);
  const buyerDisplay = snapshot.buyer.companyName
    ? `${snapshot.buyer.companyName} (${snapshot.buyer.legalName})`
    : snapshot.buyer.legalName;

  return [
    "The Sync Exchange",
    "Sync License Agreement",
    "",
    `Agreement Number: ${snapshot.agreementNumber}`,
    `Order ID: ${snapshot.orderId}`,
    `Effective Date: ${snapshot.effectiveDate}`,
    `Purchase Date: ${snapshot.purchaseDate}`,
    `Buyer: ${buyerDisplay}`,
    `Billing Contact: ${snapshot.buyer.email}`,
    `Licensor: ${snapshot.licensor.displayName}`,
    `Track: ${snapshot.track.title}`,
    `Artist: ${snapshot.track.artistName}`,
    `License: ${snapshot.license.typeName}`,
    `Fee Paid: ${feePaid}`,
    `Territory: ${snapshot.license.territory}`,
    `Term: ${snapshot.license.termLength}`,
    `Exclusivity: ${snapshot.license.exclusivity}`,
    "",
    "License Grant",
    ...wrapPdfLine(snapshot.license.grantText, 92),
    "",
    "Permitted Media",
    ...snapshot.license.permittedMedia.flatMap((item) => wrapPdfLine(`- ${item}`, 92)),
    "",
    "Restrictions",
    ...snapshot.license.restrictions.flatMap((item) => wrapPdfLine(`- ${item}`, 92)),
    ...wrapPdfLine(snapshot.license.transferRestriction, 92),
    "",
    "Ownership Reservation",
    ...wrapPdfLine(snapshot.license.ownershipReservation, 92),
    "",
    "Termination and Breach",
    ...wrapPdfLine(snapshot.license.terminationTerms, 92),
    "",
    "Rights Holders",
    ...rightsHolderLines,
    "",
    ...(snapshot.license.creditRequirements
      ? ["Credit", ...wrapPdfLine(snapshot.license.creditRequirements, 92), ""]
      : []),
    "Governing Law",
    ...wrapPdfLine(snapshot.license.governingLaw, 92),
    "",
    ...(snapshot.license.legalReviewRequired
      ? wrapPdfLine(
          "Attorney review required before this agreement template is treated as final production legal language. This artifact records the commercial terms of the purchase and the delivery entitlement for the buyer.",
          92
        )
      : [])
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPdfLine(text: string, maxChars: number) {
  const normalized = sanitizePdfText(text).trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(word.slice(0, maxChars));
    current = word.slice(maxChars);
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildSimplePdf(lines: string[]) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 56;
  const marginTop = 736;
  const lineHeight = 16;
  const maxLinesPerPage = 42;

  const pages = chunkLines(lines, maxLinesPerPage);
  const objects: Array<string | null> = [null];
  const fontObjectNumber = 3 + pages.length * 2;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages
    .map((_, index) => `${3 + index * 2} 0 R`)
    .join(" ")}] >>`;

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const contentStream = buildPdfContentStream(pageLines, marginLeft, marginTop, lineHeight);

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`;
  });

  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildPdfContentStream(lines: string[], marginLeft: number, marginTop: number, lineHeight: number) {
  const escapedLines = lines.map((line) => `(${escapePdfText(line)}) Tj`);
  return `BT\n/F1 11 Tf\n${marginLeft} ${marginTop} Td\n${lineHeight} TL\n${escapedLines.join("\nT*\n")}\nET`;
}

function chunkLines(lines: string[], maxLines: number) {
  const chunks: string[][] = [];

  for (let index = 0; index < lines.length; index += maxLines) {
    chunks.push(lines.slice(index, index + maxLines));
  }

  return chunks.length ? chunks : [[""]];
}

function sanitizePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value: string) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
