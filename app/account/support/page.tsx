import Link from "next/link";
import { requireSession } from "@/services/auth/session";
import { SECWorkbench } from "@/components/admin-v2/sec-workbench";
export default async function Support(){await requireSession();return <div className="max-w-6xl mx-auto p-6"><Link href="/account/conversations">Your licensing conversations</Link><SECWorkbench module="support" customer/></div>;}
