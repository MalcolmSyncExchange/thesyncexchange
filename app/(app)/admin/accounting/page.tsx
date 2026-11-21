import { FinancialCommandCenter } from "@/components/finance/command-center/dashboard";
import { financeFilters } from "@/lib/finance/command-center";
import { getFinancialCommandCenter } from "@/services/finance/command-center";
import { requireSession } from "@/services/auth/session";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession("admin");
  let filters;
  try {
    filters = financeFilters(await searchParams);
  } catch {
    return (
      <section
        role="alert"
        className="rounded-xl border border-amber-500/40 bg-card p-8"
      >
        <h1 className="text-2xl font-semibold">
          Choose valid financial filters
        </h1>
        <p className="my-4 text-muted-foreground">
          Use a date range of up to 366 days and select one value for each
          reporting filter.
        </p>
        <Link
          className="inline-flex min-h-11 items-center underline"
          href="/admin/accounting"
        >
          Reset financial filters
        </Link>
      </section>
    );
  }
  const data = await getFinancialCommandCenter(filters);
  return (
    <FinancialCommandCenter
      key={JSON.stringify(filters)}
      data={data}
      filters={filters}
    />
  );
}
