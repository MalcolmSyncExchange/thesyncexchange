import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedLicenseTermsSnapshot } from "./sync-license-template";

const asset = (...parts: string[]) => join(process.cwd(), ...parts);
const fonts = ["NotoSans-Regular.ttf", "NotoSansArabic-Regular.ttf", "NotoSansDevanagari-Regular.ttf", "NotoSansCJKjp-Regular.otf"];
// Bundled fonts only: no network, browser, OS font dependency or user-controlled path.
let cachedFonts: Buffer[] | undefined;
function fontBytes() { return cachedFonts ??= fonts.map(name => readFileSync(asset("assets", "license-fonts", name))); }
const MAX_BYTES = 10_000_000;
type EmbeddedFont = { font: { hasGlyphForCodePoint(code: number): boolean } };

/** Embedded Unicode fonts, shaped runs, actual font metrics and automatic pagination.
 * Missing glyphs fail issuance instead of silently corrupting a legal name. */
export async function renderUnicodeAgreementPdf(s: GeneratedLicenseTermsSnapshot): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 58, bottom: 66, left: 54, right: 54 }, bufferPages: true,
    pdfVersion: "1.7", info: { Title: `Sync License Agreement ${s.agreementNumber}`, Author: "The Sync Exchange", CreationDate: new Date(s.purchaseDate), ModDate: new Date(s.purchaseDate) } });
  const chunks: Buffer[] = []; let length = 0;
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => { length += chunk.length; if (length > MAX_BYTES) doc.destroy(new Error("Agreement exceeds secure delivery size limit.")); else chunks.push(chunk); });
    doc.once("error", reject); doc.once("end", () => resolve(Buffer.concat(chunks)));
  });
  // Attach a handler before synchronous font validation can fail.
  void finished.catch(() => undefined);
  try {
    fontBytes().forEach((b, i) => doc.registerFont(`unicode-${i}`, b));
    const embedded = fontBytes().map((_, i) => { doc.font(`unicode-${i}`); return (doc as unknown as { _font: EmbeddedFont })._font; });
    function text(value: string, size = 10) {
      const runs: Array<{ font: number; text: string }> = [];
      for (const char of value) {
        const code = char.codePointAt(0)!;
        if ((code < 32 && ![9,10,13].includes(code)) || (code >= 0xd800 && code <= 0xdfff)) throw new Error("Unsupported control or invalid Unicode in agreement.");
        const font = /\s/u.test(char) ? (runs.at(-1)?.font ?? 0) : embedded.findIndex(f => f.font.hasGlyphForCodePoint(code));
        if (font < 0) throw new Error(`Agreement requires an additional reviewed Unicode font (U+${code.toString(16).toUpperCase()}).`);
        if (runs.at(-1)?.font === font) runs.at(-1)!.text += char; else runs.push({ font, text: char });
      }
      doc.fontSize(size).fillColor("#111827");
      runs.forEach((run, i) => doc.font(`unicode-${run.font}`).text(run.text, { width: 504, continued: i < runs.length - 1, lineGap: 3, paragraphGap: 5, features: ["kern", "liga"] }));
      doc.moveDown(0.4);
    }
    function section(title: string) { if (doc.y > 650) doc.addPage(); doc.moveDown(0.6); text(title, 13); }
    const testOnly = s.payment?.paymentMode === "test" || s.payment?.commercialRightsGranted === false || s.purchase?.licenseContract?.approval.mode === "synthetic" || s.purchase?.terms.approvalReference.toUpperCase().startsWith("SYNTHETIC");
    doc.image(asset("public", "brand", "the-sync-exchange", "logos", "website-header-horizontal-light-transparent.png"), 54, 45, { fit: [200, 50] }); doc.y = 112;
    text("SYNC LICENSE AGREEMENT", 21);
    if (testOnly) text("TEST - NOT A COMMERCIAL LICENSE", 14);
    text(`Agreement Number: ${s.agreementNumber}`);
    text(`Template Version: ${s.templateVersion || "TSE-SYNC-v1"}`);
    const date = (v: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(v));
    text(`Effective Date: ${date(s.effectiveDate)} | Purchase Date: ${date(s.purchaseDate)}`);
    text(testOnly ? "Synthetic transaction record only. No commercial rights are granted. This template is not legally approved." : "Transaction record from verified payment and the immutable Buyer acceptance below. The accepted legal text controls; this summary does not expand it.");
    section("License Summary");
    for (const [label, value] of Object.entries({ Order: s.orderId, Buyer: s.buyer.legalName, Company: s.buyer.companyName || "Not provided", Contact: s.buyer.email, Licensor: s.licensor.displayName, Artist: s.track.artistName, Track: s.track.title, License: s.license.typeName,
      Fee: new Intl.NumberFormat("en-US", { style: "currency", currency: s.license.currency }).format(s.license.pricePaidCents / 100), Territory: s.license.territory, Term: s.license.termLength, Exclusivity: s.license.exclusivity })) text(`${label}: ${value}`);
    section("Licensed Recording"); text(`${s.track.title} by ${s.track.artistName}`);
    section("Rights & Ownership");
    // Independent pools are never combined into a misleading 200% ownership total.
    for (const holder of s.track.rightsHolders) text(`${holder.name} | ${holder.roleType} | ${holder.ownershipPercent}%`);
    if (!s.purchase) text(`Total Ownership: ${s.track.rightsHolders.reduce((n, h) => n + h.ownershipPercent, 0)}%`);
    for (const [title, content] of [
      ["License Grant", s.license.grantText], ["Permitted Media", s.license.permittedMedia.join("; ")], ["Restrictions", s.license.restrictions.join("; ")],
      ["Ownership and Reservation of Rights", s.license.ownershipReservation], ["Transfer / Assignment", s.license.transferRestriction], ["Termination", s.license.terminationTerms], ["Governing Law", s.license.governingLaw], ["Additional Terms", s.license.creditRequirements || "See exact accepted terms."]
    ]) { section(title); text(content); }
    if (s.purchase?.licenseContract) { section("Reviewed Scope and Pricing Contract"); text(JSON.stringify(s.purchase.licenseContract, null, 2), 9); }
    section("Acceptance");
    text("Authenticated Buyer assent records identity and declared authority. It is not a rightsholder signature or cryptographic signature.");
    if (s.purchase) {
      text(`Purchase SHA-256: ${s.purchaseHash}`);
      section(`Exact Accepted Legal Text - ${s.purchase.terms.version}`); text(s.purchase.terms.body);
      section("Complete Immutable Transaction and Acceptance Receipt"); text(JSON.stringify(s.purchase, null, 2), 8.5);
    } else text("Legacy template preview. No transaction-specific acceptance is represented.");
    if (testOnly) text("This test artifact cannot be relied upon as a commercial license. No commercial rights are granted.");
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i); doc.save().opacity(0.055).image(asset("public", "brand", "the-sync-exchange", "watermark", "Watermark.png"), 430, 665, { fit: [110, 60] }).restore();
      doc.font("unicode-0").fontSize(8).fillColor("#374151").text(`The Sync Exchange | ${s.agreementNumber} | Page ${i + 1} of ${range.count}`, 54, 747, { lineBreak: false });
      if (testOnly) doc.fontSize(9).fillColor("#991b1b").text("TEST - NOT A COMMERCIAL LICENSE", 54, 731, { lineBreak: false });
    }
    doc.end(); return await finished;
  } catch (e) { doc.destroy(e instanceof Error ? e : new Error("Agreement rendering failed.")); throw e; }
}
