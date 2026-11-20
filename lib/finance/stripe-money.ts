import { formatMinor } from "./accounting.mjs";

// Stripe retains two API decimal places for ISK and UGX despite their ISO zero
// exponent. This adapter is for invoice/charge amounts, never payout amounts.
// https://docs.stripe.com/currencies#special-cases
export function formatStripeInvoiceMinor(amount: number, currency: string) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid invoice amount.");
  if (currency === "ISK" || currency === "UGX") {
    if (amount % 100 !== 0) throw new Error("Invalid invoice currency precision.");
    return formatMinor((BigInt(amount) / BigInt(100)).toString(), currency);
  }
  return formatMinor(String(amount), currency);
}
