import { handleAgreementAccess } from "@/services/agreements/access";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return handleAgreementAccess(request, (await context.params).orderId, true);
}
