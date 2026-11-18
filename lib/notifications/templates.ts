import { notices, noticeDestination, notificationSeverity, type NoticeKind } from "./catalog.ts";
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function emailOrigin(value: string): string {
 const u = new URL(value);
 if (u.username || u.password || u.search || u.hash || u.pathname !== "/" || (u.protocol !== "https:" && !(u.protocol === "http:" && ["127.0.0.1","localhost"].includes(u.hostname)))) throw Error("unsafe_email_origin");
 return u.origin;
}
export function renderNotice(kind: string, role: string, origin: string, version = "tse-notice-v1", orderId?: string | null) {
 if (!Object.hasOwn(notices,kind) || !["artist","buyer","admin"].includes(role) || version !== "tse-notice-v1") throw Error("unsupported_notification_template");
 const [subject,body] = notices[kind as NoticeKind], base=emailOrigin(origin);
 if(orderId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId))throw Error("invalid_order_reference");
 const href=base+(role==="buyer" && orderId ? "/buyer/orders/"+orderId : noticeDestination(kind as NoticeKind,role)), preferences=base+"/account/notifications";
 const logo=base+"/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png";
 const priority=notificationSeverity(kind as NoticeKind);
 const footer="This account notification contains no license grant, legal amendment, or payment instruction. Sign in to review authoritative records.";
 const html=`<!doctype html><html lang="en" dir="ltr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title><meta name="color-scheme" content="light dark"></head><body style="margin:0;background:#f5f5f5;color:#171717;font-family:Arial,sans-serif"><div lang="en" dir="ltr" style="max-width:600px;margin:0 auto;padding:24px;background:#fff;color:#171717"><img src="${escapeHtml(logo)}" alt="The Sync Exchange" width="220" style="max-width:100%;height:auto"><h1 style="font-size:26px;line-height:1.3">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(body)}</p>${role === "admin" ? `<p style="font-size:16px">Priority: ${priority}. Review the authenticated queue; escalation does not authorize automatic financial or account actions.</p>` : ""}${orderId ? `<p style="font-size:14px">Order reference: ${escapeHtml(orderId)}</p>` : ""}<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#171717;color:#fff;padding:14px 20px;line-height:20px;text-decoration:underline;border-radius:6px">Open your secure workspace</a></p><p style="font-size:14px;line-height:1.6">${escapeHtml(footer)}</p><p style="font-size:14px;line-height:1.6"><a style="color:#333" href="${escapeHtml(preferences)}">Manage notification preferences</a>. Essential account and transaction notices remain required.</p></div></body></html>`;
 return {subject,html,text:`${subject}\n\n${role === "admin" ? `Priority: ${priority}. Review the authenticated queue.\n\n` : ""}${body}${orderId ? `\n\nOrder reference: ${orderId}` : ""}\n\nOpen your secure workspace: ${href}\n\n${footer}\n\nManage notification preferences: ${preferences}\nEssential account and transaction notices remain required.`};
}
