import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { secRequest } from "@/services/admin/sec";
import { readPaymentRequest, PaymentError, paymentHeaders } from "@/services/orders/payment-request";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{return NextResponse.json(await secRequest(await readPaymentRequest(request)),{headers:paymentHeaders});}
 catch(e){const status=e instanceof PaymentError?e.status:e instanceof ZodError||e instanceof SyntaxError||e instanceof TypeError?400:503;
 return NextResponse.json({error:e instanceof PaymentError?e.code:status===400?"CHECK_REQUIRED_FIELDS":"SEC_UNAVAILABLE"},{status,headers:paymentHeaders});}}
