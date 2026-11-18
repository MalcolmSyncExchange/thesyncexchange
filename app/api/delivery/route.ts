import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { performDeliveryRequest } from "@/services/delivery/operations";
import { readPaymentRequest, PaymentError, paymentHeaders } from "@/services/orders/payment-request";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return NextResponse.json(await performDeliveryRequest(await readPaymentRequest(request)), { headers: paymentHeaders }); }
  catch (error) {
    const status = error instanceof PaymentError ? error.status : error instanceof ZodError || error instanceof SyntaxError || error instanceof TypeError ? 400 : 503;
    return NextResponse.json({ error: error instanceof PaymentError ? error.code : status === 400 ? "CHECK_REQUIRED_FIELDS" : "DELIVERY_UNAVAILABLE" }, { status, headers: paymentHeaders });
  }
}
