import { getAccountingReport } from "@/services/finance/reports";
import { artistStatementCsv } from "@/lib/finance/portal.mjs";
import { unstable_rethrow } from "next/navigation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {"Cache-Control":"private, no-store, max-age=0", "X-Content-Type-Options":"nosniff"};
  const url = new URL(request.url), page = url.searchParams.get("page") ?? "1";
  if (![...url.searchParams.keys()].every(key => key === "page") || !/^[1-9][0-9]{0,3}$/.test(page)) return Response.json({error:"Invalid statement page."},{status:400,headers});
  try {
    const report = await getAccountingReport("artist", Number(page));
    return new Response(artistStatementCsv(report.orders), {headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="tse-test-earnings-page-${page}.csv"`}});
  } catch(error) {
    unstable_rethrow(error);
    // Fail closed, without serializing authentication or database exceptions.
    return Response.json({error:"Financial statement unavailable. Sign in as an authorized artist and try again."},{status:503,headers});
  }
}
