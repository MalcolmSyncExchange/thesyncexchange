import { NextResponse } from "next/server";

import { reportOperationalError } from "@/lib/monitoring";
import { getOrderById } from "@/services/buyer/queries";

export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  try {
    const order = await getOrderById(params.orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    reportOperationalError("order_status_poll_failed", error, {
      orderId: params.orderId
    });
    return NextResponse.json({ error: "Unable to load this order right now." }, { status: 500 });
  }
}
