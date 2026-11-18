import {getAccountingReport} from "@/services/finance/reports";
import {EarningsReport} from "@/components/finance/earnings-report";
export const dynamic="force-dynamic";
export default async function EarningsPage({searchParams}:{searchParams:Promise<{page?:string}>}){const p=(await searchParams).page;const page=p&&/^[1-9][0-9]{0,3}$/.test(p)?Number(p):1;const report=await getAccountingReport("artist",page);return <EarningsReport report={report}/>;}
