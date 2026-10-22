// Versioned, synthetic-only accounting policy. No provider or payout adapter.
// Historical money is taken verbatim from buyer-accepted minor-unit allocations.
export const REFUND_POLICY = 'proportional-floor-suspense-v1';
export const minor = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Exact nonnegative minor units required');
  return BigInt(value);
};
export function acceptedEconomics(snapshot) {
  const gross = minor(snapshot.amountCents), fee = minor(snapshot.financial?.platformFeeCents);
  const rows = snapshot.financial?.allocations;
  if (gross === 0n || !/^[A-Z]{3}$/.test(snapshot.currency) || !snapshot.financial.policyVersion ||
      !Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('Incomplete accepted economics');
  const parties = new Set();
  let total = fee;
  for (const row of rows) {
    if (typeof row.partyId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.partyId) || parties.has(row.partyId)) throw Error('Unique legal payees required');
    parties.add(row.partyId); total += minor(row.amountCents);
  }
  if (total !== gross) throw Error('Accepted allocations do not conserve gross');
  return {gross, fee, currency:snapshot.currency, policyVersion:snapshot.financial.policyVersion,
    payees:rows.map(row=>({partyId:row.partyId, amount:minor(row.amountCents)})).sort((a,b)=>a.partyId.localeCompare(b.partyId,'en'))};
}
// Each recipient reversal is monotonic, independent of event order and exactly
// original at full refund. Fractional cents stay in an explicit rounding account
// until final refund. Do not silently redistribute them under another policy.
export function refundTargets(snapshot, cumulative) {
  const e = acceptedEconomics(snapshot), refund = minor(cumulative);
  if (refund > e.gross) throw Error('Over-refund');
  const components = [{account:'platform_revenue',amount:e.fee}, ...e.payees.map(p=>({account:'payable:'+p.partyId,amount:p.amount}))];
  const result = components.map(c=>({account:c.account,minor:c.amount*refund/e.gross}));
  result.push({account:'refund_rounding',minor:refund-result.reduce((n,c)=>n+c.minor,0n)});
  return result;
}
// Configurations must be supplied explicitly; no tier, rate or effective date
// becomes a business default. This validates future policy contracts only.
export function validatePolicy(policy) {
  if (!policy || policy.synthetic !== true || !policy.version || !policy.approvalReference || !policy.tier ||
      !['gross','net_processor_fee'].includes(policy.commissionBasis) ||
      !Number.isSafeInteger(policy.commissionBps) || policy.commissionBps < 0 || policy.commissionBps > 10000 ||
      !Number.isSafeInteger(policy.maturitySeconds) || policy.maturitySeconds < 0 ||
      !Number.isFinite(Date.parse(policy.effectiveAt)) || policy.refundPolicy !== REFUND_POLICY) throw Error('Explicit synthetic policy required');
  return Object.freeze(structuredClone(policy));
}
