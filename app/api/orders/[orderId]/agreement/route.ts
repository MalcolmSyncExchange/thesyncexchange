import { handleAgreementAccess } from "@/services/agreements/access";

type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: Context) {
  return handleAgreementAccess(request, (await context.params).orderId);
}

export async function HEAD(request: Request, context: Context) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
