import Link from "next/link";
export function RetryAgreementGenerationForm({orderId}:{orderId:string}){
 return <Link href={"/admin/payments?order="+encodeURIComponent(orderId)} className="text-sm underline">Investigate and retry eligible fulfillment</Link>;
}
