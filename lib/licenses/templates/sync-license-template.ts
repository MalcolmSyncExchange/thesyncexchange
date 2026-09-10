import { formatCurrency } from "../../utils.ts";

const FALLBACK_TEMPLATE_VERSION = "TSE-SYNC-v1";

export type GeneratedLicenseTermsSnapshot = {
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
};

export function renderSyncLicenseAgreementPdf(snapshot: GeneratedLicenseTermsSnapshot) {
  return buildProfessionalAgreementPdf(snapshot);
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
  const effectiveDate = formatAgreementDate(snapshot.effectiveDate);
  const purchaseDate = formatAgreementDate(snapshot.purchaseDate);
  const templateVersion = getTemplateVersion(snapshot);
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
          <p class="body-copy">Execution and signature language requires final legal review before this automated agreement template is treated as a countersigned legal instrument.</p>
        </section>

        ${legalReviewNotice}
      </div>
    </main>
  </body>
</html>`;
}

type PdfFont = "regular" | "bold";

type PdfTextStyle = {
  font?: PdfFont;
  size?: number;
  color?: PdfColor;
};

type PdfColor = [number, number, number];

type PdfPage = {
  commands: string[];
};

type SummaryItem = {
  label: string;
  value: string;
};

const pdfColors = {
  ink: [0, 0, 0] as PdfColor,
  muted: [0.36, 0.4, 0.46] as PdfColor,
  rule: [0.78, 0.82, 0.88] as PdfColor,
  panel: [0.97, 0.98, 0.99] as PdfColor,
  paper: [1, 1, 1] as PdfColor,
  gold: [0.63, 0.47, 0.2] as PdfColor
};

function buildProfessionalAgreementPdf(snapshot: GeneratedLicenseTermsSnapshot) {
  const feePaid = formatCurrency(snapshot.license.pricePaidCents / 100, snapshot.license.currency);
  const effectiveDate = formatAgreementDate(snapshot.effectiveDate);
  const purchaseDate = formatAgreementDate(snapshot.purchaseDate);
  const buyerDisplay = snapshot.buyer.legalName;
  const templateVersion = getTemplateVersion(snapshot);
  const rightsTotal = snapshot.track.rightsHolders.reduce((total, holder) => total + Number(holder.ownershipPercent || 0), 0);
  const pages: PdfPage[] = [{ commands: [] }];
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;
  const topMargin = 54;
  const bottomMargin = 72;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = pageHeight - topMargin;

  const currentPage = () => pages[pages.length - 1];
  const addCommand = (command: string) => currentPage().commands.push(command);
  const addPage = () => {
    pages.push({ commands: [] });
    cursorY = pageHeight - topMargin;
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < bottomMargin) {
      addPage();
    }
  };

  const moveDown = (amount: number) => {
    cursorY -= amount;
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor = pdfColors.rule, width = 0.7) => {
    addCommand(`${formatColor(color, "stroke")}\n${formatNumber(width)} w\n${formatNumber(x1)} ${formatNumber(y1)} m\n${formatNumber(x2)} ${formatNumber(y2)} l\nS`);
  };

  const drawRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    options: { fill?: PdfColor; stroke?: PdfColor; strokeWidth?: number } = {}
  ) => {
    const commands: string[] = ["q"];
    if (options.fill) {
      commands.push(formatColor(options.fill, "fill"));
      commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re f`);
    }
    if (options.stroke) {
      commands.push(formatColor(options.stroke, "stroke"));
      commands.push(`${formatNumber(options.strokeWidth ?? 0.6)} w`);
      commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S`);
    }
    commands.push("Q");
    addCommand(commands.join("\n"));
  };

  const drawText = (text: string, x: number, y: number, style: PdfTextStyle = {}) => {
    const font = style.font === "bold" ? "F2" : "F1";
    const size = style.size ?? 10;
    const color = style.color ?? pdfColors.ink;
    addCommand(
      [
        "BT",
        formatColor(color, "fill"),
        `/${font} ${formatNumber(size)} Tf`,
        `${formatNumber(x)} ${formatNumber(y)} Td`,
        `(${escapePdfText(text)}) Tj`,
        "ET"
      ].join("\n")
    );
  };

  const drawWrappedText = (
    text: string,
    x: number,
    width: number,
    style: PdfTextStyle & { leading?: number; bullet?: boolean } = {}
  ) => {
    const size = style.size ?? 10;
    const leading = style.leading ?? size + 4;
    const lines = wrapPdfText(text, width, size);
    lines.forEach((line) => {
      ensureSpace(leading);
      drawText(line, x, cursorY, style);
      moveDown(leading);
    });
    return lines.length;
  };

  const addSectionHeading = (title: string) => {
    ensureSpace(110);
    moveDown(20);
    drawText(title, marginX, cursorY, { font: "bold", size: 13, color: pdfColors.ink });
    drawLine(marginX, cursorY - 7, marginX + contentWidth, cursorY - 7, pdfColors.rule, 0.6);
    moveDown(24);
  };

  const addParagraph = (text: string) => {
    ensureSpace(58);
    drawWrappedText(text, marginX, contentWidth, { size: 10.2, leading: 14.8, color: pdfColors.ink });
    moveDown(8);
  };

  const addBulletList = (items: string[]) => {
    items.forEach((item) => {
      const bulletX = marginX + 6;
      const textX = marginX + 18;
      const wrapped = wrapPdfText(item, contentWidth - 18, 10);
      ensureSpace(wrapped.length * 14 + 6);
      drawText("-", bulletX, cursorY, { font: "bold", size: 10, color: pdfColors.gold });
      wrapped.forEach((line, index) => {
        drawText(line, textX, cursorY - index * 14, { size: 10, color: pdfColors.ink });
      });
      moveDown(wrapped.length * 14 + 5);
    });
    moveDown(4);
  };

  const addSummaryGrid = (items: SummaryItem[]) => {
    const columnGap = 12;
    const rowGap = 8;
    const columnWidth = (contentWidth - columnGap) / 2;
    const rowHeight = 50;
    const rows = Math.ceil(items.length / 2);
    ensureSpace(rows * (rowHeight + rowGap) + 8);

    items.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = marginX + column * (columnWidth + columnGap);
      const topY = cursorY - row * (rowHeight + rowGap);
      const boxY = topY - rowHeight + 8;
      drawRect(x, boxY, columnWidth, rowHeight, { fill: pdfColors.panel, stroke: pdfColors.rule });
      drawText(item.label.toUpperCase(), x + 12, topY - 10, { font: "bold", size: 7.6, color: pdfColors.muted });
      const valueLines = wrapPdfText(item.value, columnWidth - 34, 9.1).slice(0, 2);
      valueLines.forEach((line, lineIndex) => {
        drawText(line, x + 12, topY - 25 - lineIndex * 11, { font: "bold", size: 9.1, color: pdfColors.ink });
      });
    });

    moveDown(rows * (rowHeight + rowGap) + 8);
  };

  const addRightsTable = () => {
    const nameWidth = 232;
    const roleWidth = 172;
    const headerHeight = 24;
    const rowHeight = 28;
    const rows = snapshot.track.rightsHolders.length
      ? snapshot.track.rightsHolders
      : [{ name: "Rights holder details were not available when this agreement was generated.", roleType: "", ownershipPercent: 0 }];
    ensureSpace(headerHeight + rows.length * rowHeight + 44);

    drawRect(marginX, cursorY - headerHeight + 6, contentWidth, headerHeight, { fill: pdfColors.panel, stroke: pdfColors.rule });
    drawText("NAME", marginX + 10, cursorY - 10, { font: "bold", size: 8, color: pdfColors.muted });
    drawText("ROLE", marginX + nameWidth + 10, cursorY - 10, { font: "bold", size: 8, color: pdfColors.muted });
    drawText("OWNERSHIP", marginX + nameWidth + roleWidth + 10, cursorY - 10, { font: "bold", size: 8, color: pdfColors.muted });
    moveDown(headerHeight);

    rows.forEach((holder) => {
      const nameLines = wrapPdfText(holder.name, nameWidth - 20, 9.5);
      const roleLines = wrapPdfText(holder.roleType, roleWidth - 20, 9.5);
      const lineCount = Math.max(nameLines.length, roleLines.length, 1);
      const dynamicRowHeight = Math.max(rowHeight, lineCount * 12 + 16);
      ensureSpace(dynamicRowHeight + 44);
      drawLine(marginX, cursorY + 6, marginX + contentWidth, cursorY + 6, pdfColors.rule, 0.4);
      nameLines.forEach((line, index) => {
        drawText(line, marginX + 10, cursorY - 10 - index * 12, { size: 9.5, color: pdfColors.ink });
      });
      roleLines.forEach((line, index) => {
        drawText(line, marginX + nameWidth + 10, cursorY - 10 - index * 12, { size: 9.5, color: pdfColors.ink });
      });
      drawText(`${holder.ownershipPercent}%`, marginX + nameWidth + roleWidth + 10, cursorY - 10, { font: "bold", size: 9.5, color: pdfColors.ink });
      moveDown(dynamicRowHeight);
    });

    drawLine(marginX, cursorY + 6, marginX + contentWidth, cursorY + 6, pdfColors.rule, 0.4);
    moveDown(12);
    drawText(`Total Ownership: ${formatOwnershipPercent(rightsTotal)}`, marginX, cursorY, {
      font: "bold",
      size: 10.5,
      color: pdfColors.ink
    });
    moveDown(22);
  };

  drawText("THE SYNC EXCHANGE", marginX, cursorY, { font: "bold", size: 10.5, color: pdfColors.gold });
  drawText(templateVersion, pageWidth - marginX - estimateTextWidth(templateVersion, 8.5), cursorY, {
    font: "bold",
    size: 8.5,
    color: pdfColors.muted
  });
  moveDown(28);
  drawText("SYNC LICENSE AGREEMENT", marginX, cursorY, { font: "bold", size: 21, color: pdfColors.ink });
  moveDown(22);
  drawText(`Agreement Number: ${snapshot.agreementNumber}`, marginX, cursorY, { font: "bold", size: 10.5, color: pdfColors.ink });
  drawText(`Effective Date: ${effectiveDate}`, marginX, cursorY - 16, { size: 9.5, color: pdfColors.muted });
  drawText(`Purchase Date: ${purchaseDate}`, marginX + 210, cursorY - 16, { size: 9.5, color: pdfColors.muted });
  moveDown(36);
  drawLine(marginX, cursorY, marginX + contentWidth, cursorY, pdfColors.gold, 1);
  moveDown(22);
  addParagraph(
    "This license agreement was generated automatically after verified Stripe payment. It records the commercial rights granted for this purchase and the secure delivery entitlement for the buyer identified below."
  );

  addSectionHeading("License Summary");
  addSummaryGrid([
    { label: "Agreement Number", value: snapshot.agreementNumber },
    { label: "Order ID", value: snapshot.orderId },
    { label: "Buyer", value: buyerDisplay },
    { label: "Buyer Company", value: snapshot.buyer.companyName || "Not provided" },
    { label: "Billing Contact", value: snapshot.buyer.email },
    { label: "Licensor", value: snapshot.licensor.displayName },
    { label: "Artist", value: snapshot.track.artistName },
    { label: "Track", value: snapshot.track.title },
    { label: "License Type", value: snapshot.license.typeName },
    { label: "License Fee", value: feePaid },
    { label: "Territory", value: snapshot.license.territory },
    { label: "Term", value: snapshot.license.termLength },
    { label: "Exclusivity", value: snapshot.license.exclusivity },
    { label: "Template Version", value: templateVersion }
  ]);

  addSectionHeading("Licensed Recording");
  addParagraph(
    `This agreement covers the recording identified as ${snapshot.track.title} by ${snapshot.track.artistName} under the purchased license tier ${snapshot.license.typeName}.`
  );

  ensureSpace(180);
  addSectionHeading("Rights & Ownership");
  addRightsTable();

  addSectionHeading("License Grant");
  addParagraph(snapshot.license.grantText);

  addSectionHeading("Permitted Media");
  addBulletList(snapshot.license.permittedMedia);

  addSectionHeading("Restrictions");
  addBulletList(snapshot.license.restrictions);

  addSectionHeading("Ownership and Reservation of Rights");
  addParagraph(snapshot.license.ownershipReservation);

  addSectionHeading("Transfer / Assignment");
  addParagraph(snapshot.license.transferRestriction);

  addSectionHeading("Termination");
  addParagraph(snapshot.license.terminationTerms);

  addSectionHeading("Governing Law");
  addParagraph(snapshot.license.governingLaw);

  addSectionHeading("Additional Terms");
  if (snapshot.license.creditRequirements) {
    addParagraph(snapshot.license.creditRequirements);
  }
  if (snapshot.license.legalReviewRequired) {
    addParagraph(
      "Attorney review required before this agreement template is treated as final production legal language. This artifact records the commercial terms of the purchase and the delivery entitlement for the buyer."
    );
  }

  addSectionHeading("Acceptance");
  addParagraph(
    "Execution and signature language requires final legal review before this automated agreement template is treated as a countersigned legal instrument."
  );

  return buildPdfFromPages(pages, {
    pageWidth,
    pageHeight,
    marginX,
    footer: {
      left: "The Sync Exchange",
      center: snapshot.agreementNumber
    }
  });
}

function getTemplateVersion(snapshot: GeneratedLicenseTermsSnapshot) {
  return snapshot.templateVersion || FALLBACK_TEMPLATE_VERSION;
}

function formatOwnershipPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`;
}

function buildPdfFromPages(
  pages: PdfPage[],
  {
    pageWidth,
    pageHeight,
    marginX,
    footer
  }: {
    pageWidth: number;
    pageHeight: number;
    marginX: number;
    footer: {
      left: string;
      center: string;
    };
  }
) {
  const pageCount = pages.length;
  const objects: Array<string | null> = [null];
  const fontObjectNumber = 3 + pageCount * 2;
  const boldFontObjectNumber = fontObjectNumber + 1;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pages
    .map((_, index) => `${3 + index * 2} 0 R`)
    .join(" ")}] >>`;

  pages.forEach((page, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const footerCommands = buildFooterCommands({
      pageIndex: index,
      pageCount,
      pageWidth,
      pageHeight,
      marginX,
      footer
    });
    const contentStream = [buildPageBackgroundCommand(pageWidth, pageHeight), ...page.commands, ...footerCommands].join("\n");

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontObjectNumber} 0 R /F2 ${boldFontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`;
  });

  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

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

function buildPageBackgroundCommand(pageWidth: number, pageHeight: number) {
  return [
    "q",
    formatColor(pdfColors.paper, "fill"),
    `0 0 ${formatNumber(pageWidth)} ${formatNumber(pageHeight)} re`,
    "f",
    "Q"
  ].join("\n");
}

function buildFooterCommands({
  pageIndex,
  pageCount,
  pageWidth,
  marginX,
  footer
}: {
  pageIndex: number;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  footer: {
    left: string;
    center: string;
  };
}) {
  const y = 36;
  const pageText = `Page ${pageIndex + 1} of ${pageCount}`;
  const centerX = pageWidth / 2 - estimateTextWidth(footer.center, 8) / 2;
  const pageTextX = pageWidth - marginX - estimateTextWidth(pageText, 8);

  return [
    `${formatColor(pdfColors.rule, "stroke")}\n0.5 w\n${formatNumber(marginX)} ${formatNumber(y + 15)} m\n${formatNumber(pageWidth - marginX)} ${formatNumber(y + 15)} l\nS`,
    buildTextCommand(footer.left, marginX, y, { font: "bold", size: 8, color: pdfColors.muted }),
    buildTextCommand(footer.center, centerX, y, { size: 8, color: pdfColors.muted }),
    buildTextCommand(pageText, pageTextX, y, { size: 8, color: pdfColors.muted })
  ];
}

function buildTextCommand(text: string, x: number, y: number, style: PdfTextStyle = {}) {
  const font = style.font === "bold" ? "F2" : "F1";
  const size = style.size ?? 10;
  const color = style.color ?? pdfColors.ink;

  return [
    "BT",
    formatColor(color, "fill"),
    `/${font} ${formatNumber(size)} Tf`,
    `${formatNumber(x)} ${formatNumber(y)} Td`,
    `(${escapePdfText(text)}) Tj`,
    "ET"
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPdfText(text: string, maxWidth: number, fontSize: number) {
  const normalized = sanitizePdfText(text).trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    const splitWord = splitLongWord(word, maxWidth, fontSize);
    lines.push(...splitWord.slice(0, -1));
    current = splitWord.at(-1) || "";
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function splitLongWord(word: string, maxWidth: number, fontSize: number) {
  const chunks: string[] = [];
  let current = "";

  for (const char of word) {
    const candidate = `${current}${char}`;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = char;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [word];
}

function estimateTextWidth(text: string, fontSize: number) {
  return sanitizePdfText(text)
    .split("")
    .reduce((width, char) => {
      if (char === " ") return width + fontSize * 0.26;
      if ("il.,'".includes(char)) return width + fontSize * 0.28;
      if ("mwMW".includes(char)) return width + fontSize * 0.86;
      if (/[A-Z0-9]/.test(char)) return width + fontSize * 0.64;
      return width + fontSize * 0.54;
    }, 0);
}

function formatColor(color: PdfColor, mode: "fill" | "stroke") {
  const operator = mode === "fill" ? "rg" : "RG";
  return `${formatNumber(color[0])} ${formatNumber(color[1])} ${formatNumber(color[2])} ${operator}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function sanitizePdfText(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value: string) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
