import "server-only";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
import {
  commandReportSchema,
  type FinanceFilters,
} from "@/lib/finance/command-center";
export async function getFinancialCommandCenter(filters: FinanceFilters) {
  await requireSession("admin");
  let data: unknown;
  let error: unknown;
  try {
    const client = await createServerSupabaseClient();
    const reader = client as unknown as {
      rpc(
        name: string,
        args: object,
      ): {
        abortSignal(
          signal: AbortSignal,
        ): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
    ({ data, error } = await reader
      .rpc("sec_financial_command_center", {
        p_start: filters.start + "T00:00:00Z",
        p_end: new Date(Date.parse(filters.end) + 86400000).toISOString(),
        p_mode: filters.mode,
        p_currency: filters.currency || null,
        p_account: filters.account || null,
        p_status: filters.status,
        p_source: filters.source,
        p_interval: filters.interval,
        p_page: filters.page,
        p_search: filters.q,
      })
      .abortSignal(AbortSignal.timeout(15000)));
  } catch {
    throw Error(
      "Financial reporting could not be loaded. Access or reporting availability requires review.",
    );
  }
  // Authorization, database and transport failures must never masquerade as empty financial history.
  if (error)
    throw Error(
      "Financial reporting could not be loaded. Access or reporting availability requires review.",
    );
  const report = commandReportSchema.safeParse(data);
  if (!report.success)
    throw Error("Financial reporting returned incomplete evidence.");
  return report.data;
}
