// Read-only projections of recorded allocations. Never infer ownership, FX, or cash.
export function artistFinancialTotals(orders) {
  const currencies = new Map(), seen = new Set();
  for (const order of orders) {
    if (seen.has(order.orderId)) throw Error('Duplicate accounting order');
    seen.add(order.orderId);
    if (!/^[A-Z]{3}$/.test(order.currency) || typeof order.paidEvidence !== 'boolean') throw Error('Invalid accounting evidence');
    const row = currencies.get(order.currency) ?? {currency:order.currency, earnedMinor:0n, pendingMinor:0n, heldMinor:0n, lossesMinor:0n, recoveryMinor:0n, commissionMinor:0n, paidMinor:0n, availableMinor:0n};
    const minor = value => { if(typeof value !== 'string' || !/^-?(0|[1-9][0-9]{0,29})$/.test(value)) throw Error('Invalid accounting amount'); return BigInt(value); };
    if (order.managedSale && order.paidEvidence) row.commissionMinor += minor(order.platformFeeMinor);
    for (const allocation of order.allocations.filter(a => a.attributedToYou === true)) {
      if (order.paidEvidence) {
        row.earnedMinor += minor(allocation.owedMinor);
        row.heldMinor += minor(allocation.heldMinor);
        row.lossesMinor += minor(allocation.refundAndLossMinor);
        row.recoveryMinor += minor(allocation.recoveryMinor);
      } else row.pendingMinor += minor(allocation.pendingMinor);
      row.paidMinor += minor(allocation.paidMinor);
      row.availableMinor += minor(allocation.availableMinor);
    }
    currencies.set(order.currency,row);
  }
  return [...currencies.values()].map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k,typeof v === 'bigint' ? v.toString() : v])));
}

// Quoting alone does not prevent spreadsheet formula execution.
const cell = value => '"' + (/^[\s]*[=+@-]|^[\t\r\n]/.test(String(value)) ? "'" : '') + String(value ?? '').replaceAll('"','""') + '"';
export function artistStatementCsv(orders) {
  artistFinancialTotals(orders); // Reject duplicate/malformed monetary evidence.
  const rows = [['Basis','Order','Recorded UTC','Track','Currency','Payment evidence','Contributor','Net earned minor','Pending minor','Held minor','Refunds and losses minor','Actual paid minor','Available minor']];
  for (const o of orders) for (const a of o.allocations.filter(a => a.attributedToYou === true)) rows.push(['TEST accounting; not a bank statement',o.orderId,o.createdAt,o.trackTitle,o.currency,o.paidEvidence?'Posted payment':'Not posted',a.legalName,o.paidEvidence?a.owedMinor:'0',o.paidEvidence?'0':a.pendingMinor,o.paidEvidence?a.heldMinor:'0',o.paidEvidence?a.refundAndLossMinor:'0',a.paidMinor,a.availableMinor]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
