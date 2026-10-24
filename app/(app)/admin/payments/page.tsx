import { requireSession } from "@/services/auth/session";
import { PaymentOperations } from "@/components/orders/payment-panel";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams?: Promise<{ order?: string }> }) {
  await requireSession("admin");
  const order = (await searchParams)?.order || "";
  return <PaymentOperations initialOrder={/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(order) ? order : ""}/>;
}
