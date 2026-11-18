export const notices = {
 rights_review_started: ["Rights review requested", "Your submitted rights evidence has entered the review workflow. Review its current status securely in your workspace."],
 license_activity: ["Catalog licensing activity recorded", "A generated license associated with your catalog has verified payment evidence. Review the licensing and financial records in your workspace; this notice does not confirm a payout."],
 account_confirmed: ["Your email is verified", "Your account email has been verified. You can continue in your workspace."],
 onboarding_complete: ["Artist onboarding complete", "Your onboarding information has been recorded. Submission and catalog approval are separate steps."],
 submission_received: ["Music submission received", "Your submission has entered the review workflow. Review its current status in your workspace."],
 upload_failed: ["Audio processing needs attention", "An upload could not complete processing. Open your workspace to review the issue and recovery options."],
 upload_ready: ["Audio processing complete", "An upload completed processing. This does not establish rights or catalog approval."],
 rights_clarification: ["Rights information requested", "A rights review requires more information. Review the request securely in your workspace."],
 rights_approved: ["Rights review approved", "A rights review was approved. Catalog publication and individual license permissions remain separate checks."],
 rights_rejected: ["Rights review decision available", "A rights review was not approved. Review the decision in your workspace."],
 rights_disputed: ["Rights status requires attention", "A rights dispute has been recorded. Review the current restrictions in your workspace."],
 rights_revoked: ["Rights approval changed", "A rights approval has been revoked. Review the current licensing restrictions in your workspace."],
 rights_expired: ["Rights evidence expired", "Rights evidence requires renewal or review. Open your workspace for the current status."],
 catalog_changes_requested: ["Catalog information requested", "Catalog review requires changes. Review the request in your workspace."],
 catalog_approved: ["Catalog review approved", "Catalog review was approved. Publication remains a separate controlled action."],
 catalog_rejected: ["Catalog review decision available", "A catalog review decision is available in your workspace."],
 catalog_published: ["Catalog publication recorded", "A catalog publication was recorded. Your workspace shows the current availability."],
 catalog_suspended: ["Catalog publication suspended", "A catalog item was suspended. Review its current status in your workspace."],
 catalog_unpublished: ["Catalog item unpublished", "A catalog item was unpublished. Review its current status in your workspace."],
 catalog_archived: ["Catalog item archived", "A catalog item was archived. Historical transaction evidence is preserved."],
 purchase_confirmed: ["Verified payment recorded", "A verified payment has been recorded. Your order contains the transaction details and current fulfillment status."],
 payment_failed: ["Payment did not complete", "A payment failure was recorded. Review your order before attempting recovery. A failed payment does not authorize a license."],
 payment_recovered: ["Payment recovery recorded", "A previously interrupted payment now has verified payment evidence. Check your order for its current status."],
 license_ready: ["License agreement available", "A generated license agreement is available through your authenticated order. Any current restrictions continue to apply."],
 assets_ready: ["Licensed assets available", "Your order has active asset entitlements. Sign in to access only the deliverables authorized by your license."],
 refund: ["Refund recorded", "Verified refund evidence has been recorded. Review your order for the amount and current license and access status."],
 partial_refund: ["Partial refund recorded", "Verified partial-refund evidence has been recorded. Review your order for the amount and current access status."],
 payment_disputed: ["Payment dispute recorded", "A payment dispute has been recorded. Review your order for the current restrictions and support options."],
 license_status: ["License access status changed", "A license associated with your account has changed status. Review its current authenticated record before using or downloading licensed materials."],
 support_response: ["Support response available", "A support response is available in your authenticated support history. Private conversation content is not included in this email."],
 account_security: ["Account security status changed", "An account access or administrative permission change was recorded. Review Account Security. If unexpected, contact support from your account."],
 earnings_updated: ["Earnings records updated", "Accounting records related to your catalog changed. Review your financial workspace for verified balances. This notice does not confirm a cash payout."],
 payout_status: ["Payout workflow status updated", "A payout workflow update was recorded. Current workflows may be simulated; review the financial workspace for the exact status. This notice does not confirm a bank transfer."],
 rights_queue: ["Rights review queue needs attention", "New rights review activity is available in THE SEC."],
 catalog_queue: ["Catalog moderation queue needs attention", "New catalog review activity is available in THE SEC."],
 media_failure: ["Media processing alert", "Media processing failures require review in THE SEC."],
 checkout_failure: ["Checkout recovery alert", "Payment failure activity requires review in THE SEC."],
 financial_exception: ["Financial reconciliation review", "Financial reconciliation evidence is available for operator review in THE SEC."],
 delivery_failure: ["Asset delivery alert", "Asset delivery failures require review in THE SEC."],
 dispute_alert: ["Payment dispute alert", "Verified dispute evidence requires review in THE SEC."],
 support_escalation: ["Support escalation", "An escalated support case requires review in THE SEC."],
 admin_security: ["Administrative security alert", "An administrative permission change requires review in THE SEC."],
 worker_failure: ["Financial worker alert", "Financial worker processing requires review in THE SEC."],
 dead_letter: ["Financial dead-letter alert", "Held or exhausted financial events require review in THE SEC. Do not replay uncertain effects without reconciliation."],
 email_dead_letter: ["Email delivery alert", "Email delivery failures require operator review. Delivery acceptance does not prove inbox receipt."]
} as const;
export type NoticeKind = keyof typeof notices;
export function noticeDestination(kind: NoticeKind, role: string): string {
 if (role === "admin") return kind === "email_dead_letter" ? "/admin/notifications" : kind === "financial_exception" || kind === "dead_letter" || kind === "worker_failure" ? "/admin/accounting" : "/admin";
 if (kind === "account_security") return "/account/security";
 if (kind === "support_response") return "/account/support";
 if (role === "artist") return "/artist";
 return "/buyer/orders";
}

export function notificationSeverity(kind: NoticeKind): "high" | "warning" | "info" {
 if (["account_security","admin_security","dispute_alert","financial_exception","dead_letter","email_dead_letter","rights_disputed","rights_revoked"].includes(kind)) return "high";
 if (["worker_failure","media_failure","checkout_failure","delivery_failure","support_escalation","upload_failed","payment_failed"].includes(kind)) return "warning";
 return "info";
}
