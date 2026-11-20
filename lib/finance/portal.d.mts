import type { AccountingOrder } from '../../services/finance/reports';
export function artistFinancialTotals(orders: AccountingOrder[]): Array<Record<string,string>>;
export function artistStatementCsv(orders: AccountingOrder[]): string;
