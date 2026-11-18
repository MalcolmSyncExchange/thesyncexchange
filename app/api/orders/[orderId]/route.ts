import { paymentHeaders } from "@/services/orders/payment-request";
import { NextResponse } from "next/server";

import { reportOperationalError } from "@/lib/monitoring";
import { getOrderById } from "@/services/buyer/queries";

export async function GET(_request: Request, props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params;
  try {
    const order = await getOrderById(params.orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404, headers:paymentHeaders });
    }

    return NextResponse.json({ order },{headers:paymentHeaders});
  } catch (error) {
    reportOperationalError("order_status_poll_failed", error, {
      orderId: params.orderId
    });
    return NextResponse.json({ error: "Unable to load this order right now." }, { status: 500,headers:paymentHeaders });
  }
}
