import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export type EmailConfig = { key: string; from: string; origin: string; replyTo: string };
const address=/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
export function validEmail(value: unknown): value is string { return typeof value === "string" && value.length <= 254 && address.test(value); }
export async function boundedText(response: Response, max = 4096) {
 const reader=response.body?.getReader();if(!reader)throw Error("empty_response");let text="",size=0;const decoder=new TextDecoder();
 try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error("oversized_response");}text+=decoder.decode(value,{stream:true});}return text+decoder.decode(); }finally{reader.releaseLock();}
}
export async function sendNotice(config: EmailConfig, id: string, to: string, content: {subject:string;html:string;text:string}, fetcher: typeof fetch = fetch): Promise<{outcome:"accepted"|"transient"|"permanent"|"configuration";provider?:string}> {
 if(!validEmail(to)||!validEmail(config.from)||!validEmail(config.replyTo)||!/^re_[A-Za-z0-9_]+$/.test(config.key)||!/^[0-9a-f-]{36}$/.test(id))return {outcome:"configuration"};
 try {
 const response=await fetcher("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.key}`,"Content-Type":"application/json","Idempotency-Key":`tse-email-v1/${id}`},body:JSON.stringify({from:`The Sync Exchange <${config.from}>`,to:[to],reply_to:config.replyTo,...content})});
 if(response.status===429||response.status>=500)return {outcome:"transient"};
 if(response.status===401||response.status===403)return {outcome:"configuration"};
 if(!response.ok)return {outcome:"permanent"};
 const data=JSON.parse(await boundedText(response));
 return typeof data.id==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(data.id)?{outcome:"accepted",provider:data.id}:{outcome:"transient"};
 }catch{return {outcome:"transient"};}
}
export function verifyDeliveryEvent(raw: string, headers: Headers, secret: string, now = Date.now()) {
 if(Buffer.byteLength(raw)>65536||!secret.startsWith("whsec_"))throw Error("invalid_delivery_event");
 const id=headers.get("svix-id")??"",timestamp=headers.get("svix-timestamp")??"",signature=headers.get("svix-signature")??"";
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||signature.length>2048)throw Error("invalid_delivery_event");
 const key=Buffer.from(secret.slice(6),"base64");if(key.length<32)throw Error("invalid_delivery_event");
 const expected=createHmac("sha256",key).update(`${id}.${timestamp}.${raw}`).digest();
 if(!signature.split(" ").some(part=>{if(!part.startsWith("v1,"))return false;const given=Buffer.from(part.slice(3),"base64");return given.length===expected.length&&timingSafeEqual(expected,given);}))throw Error("invalid_delivery_event");
 const event=JSON.parse(raw),kind=event.type,provider=event.data?.email_id,at=event.created_at;
 if(!["email.sent","email.delivered","email.bounced","email.complained","email.failed","email.delivery_delayed"].includes(kind)||typeof provider!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(provider)||typeof at!=="string"||!Number.isFinite(Date.parse(at))||Date.parse(at)>now+300000)throw Error("unsupported_delivery_event");
 return {id,hash:createHash("sha256").update(raw).digest("hex"),provider,kind,at};
}
