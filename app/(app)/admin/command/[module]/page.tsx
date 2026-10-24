import { notFound } from "next/navigation";
import { SECWorkbench } from "@/components/admin-v2/sec-workbench";
import { isSECModule } from "@/lib/admin-v2/sec-modules";
export default async function SECPage({params,searchParams}:{params:Promise<{module:string}>;searchParams:Promise<{account?:string}>}){const {module}=await params;if(!isSECModule(module))notFound();const account=(await searchParams).account;return <SECWorkbench module={module} account={account&&/^[0-9a-f-]{36}$/i.test(account)?account:undefined}/>;}
