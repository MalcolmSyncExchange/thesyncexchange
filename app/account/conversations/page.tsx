import Link from "next/link";
import { requireSession } from "@/services/auth/session";
import { SECWorkbench } from "@/components/admin-v2/sec-workbench";
export default async function Conversations({searchParams}:{searchParams:Promise<{track?:string}>}){const track=(await searchParams).track;await requireSession();return <div className="max-w-6xl mx-auto p-6"><Link href="/account/support">Support and disputes</Link><SECWorkbench module="deals" customer track={track&&/^[0-9a-f-]{36}$/i.test(track)?track:undefined}/></div>;}
