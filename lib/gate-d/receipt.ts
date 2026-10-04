import { createHash } from "node:crypto";

const MAX_RECEIPT_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_INTENT = /^pi_[A-Za-z0-9]{1,240}$/;

export type GateDReceiptInput = {
  orderId: string;
  paymentDate: string;
  trackTitle: string;
  licenseName: string;
  amountMinor: number;
  currency: string;
  paymentIntentId: string;
};

export type RenderedGateDReceipt = {
  bytes: Buffer;
  sha256: string;
  byteSize: number;
  mimeType: "application/pdf";
};

export function renderGateDReceipt(input: GateDReceiptInput): RenderedGateDReceipt {
  if (!UUID.test(input.orderId) || !PAYMENT_INTENT.test(input.paymentIntentId)) {
    throw new Error("Invalid Gate D receipt identity.");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Invalid Gate D receipt amount.");
  }
  const currency = boundedText(input.currency.toUpperCase(), 3, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid Gate D receipt currency.");
  const paymentDate = new Date(input.paymentDate);
  if (!Number.isFinite(paymentDate.getTime())) throw new Error("Invalid Gate D receipt date.");

  const trackTitle = boundedText(input.trackTitle, 160, "track title");
  const licenseName = boundedText(input.licenseName, 120, "license name");
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(input.amountMinor / 100);

  const lines = [
    "THE SYNC EXCHANGE",
    "TEST - NOT A TAX INVOICE",
    "",
    "Production Beta TEST Payment Receipt",
    "",
    `Order ID: ${input.orderId}`,
    `Payment date: ${paymentDate.toISOString()}`,
    `Track: ${trackTitle}`,
    `License: ${licenseName}`,
    `Amount: ${amount} ${currency}`,
    `PaymentIntent: ${input.paymentIntentId}`,
    "",
    "Classification: TEST",
    "Commercial rights granted: false",
    "Payable earnings calculated: false",
    "",
    "TEST - NOT A TAX INVOICE"
  ];

  const bytes = buildPdf(lines);
  if (bytes.byteLength > MAX_RECEIPT_BYTES) {
    throw new Error("Gate D receipt exceeds the reviewed byte limit.");
  }
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.byteLength,
    mimeType: "application/pdf"
  };
}

export function gateDReceiptObjectPath(grantId: string) {
  if (!UUID.test(grantId)) throw new Error("Invalid Gate D grant identity.");
  return `gate-d/${grantId}/receipt-v1.pdf`;
}

function boundedText(value: string, maximum: number, field: string) {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`Invalid Gate D receipt ${field}.`);
  }
  return normalized;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines: string[]) {
  const content = `BT
/F1 11 Tf
56 736 Td
16 TL
${lines.map((line) => `(${escapePdfText(line)}) Tj`).join("\nT*\n")}
ET`;
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>
stream
${content}
endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
