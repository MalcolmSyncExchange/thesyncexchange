# System 13 — Email & Notifications local acceptance

**Locally complete · Complete — Not Live · Private Beta NO-GO. Stop before System 14.**

Implementation: `96c54da51f4b574eeeb00793714dc5249105ad37` on `codex/system13-email-notifications`, based on System 12 `2e5c58c724805852269d2ae52e6081b67b7e0c53`. The acceptance report is committed separately. No push, merge, deployment, hosted migration, provider configuration, real email, analytics/commerce activation or financial transaction occurred.

Reviewed the twelve System 01–12 acceptance reports/branch ancestry and existing Auth, account settings, rights/catalog, legal snapshots, checkout, secure delivery, ledger/reconciliation, SEC and analytics contracts. Working confirmation/recovery/email-change/MFA safeguards and all existing domain workflows remain intact. Repository email delivery previously had no application sender/outbox; Buyer settings defaulted optional marketing on and allowed transaction notices off. Historical hosted delivery claims were not reverified.

Delivered:

- Forty-five application notice kinds for canonical Artist/Buyer/operational activity; five Auth action templates and six native security-notification templates, each with HTML/plain source. Auth retains token creation/validation and scanner-safe interstitials. No tokens enter the application outbox.
- Verified payment, original legal acceptance and canonical order/party bindings before success notices. Generated agreement/active asset notices have separate evidence checks. Original seller, journal-time contributor and frozen payout identities prevent later catalog/payee changes retargeting historical notifications. Contract termination/revocation cancels unsent availability and notifies original parties independently of payment status.
- Private durable outbox, dedupe, exclusive leases, immutable request digests, bounded backoff/retry, interrupted-worker recovery, provider-window stop and audited safe operator recovery. Email failures cannot reverse purchases or licenses. Raw-body signed delivery events retain IDs/hashes/conflicts, support pre-ack/out-of-order delivery and enforce bounce/complaint suppression. Address pruning preserves dedupe and accepts late evidence without reconstructing deleted addresses.
- Required security/transaction notices; separate operational opt-out and versioned marketing consent off by default. Existing Buyer settings and new account preferences share canonical consent. No marketing campaign or one-click campaign endpoint is enabled.
- Scoped/coalesced severity-based SEC alerts and MFA/full-capability delivery visibility/recovery. No private rights documents, messages, credentials, financial amounts or asset URLs in message bodies. Buyer order links derive from authorized canonical records.
- Exact founder-approved light logo copied unchanged for email. Current founder brand instructions supersede one obsolete absence assertion; existing website mappings and other retired-asset checks remain intact. Image loading, mobile layout, keyboard focus, safe HTML/plain rendering and accessible structure were checked locally.

Database: `supabase/migrations/20261024220724_system13_email_notifications.sql` is migration **66**, not applied hosted. All **65 prior migrations are byte-identical**. Adds eight FORCE-RLS private tables, four private views and ten narrow public RPCs; default sending is OFF. Legacy preference writes enforce required notices. No critical commerce/Auth transaction triggers, hosted Storage changes or existing financial/legal record mutations are introduced. Proposed 90-day terminal-address pruning requires privacy/legal approval and explicit scheduling.

Routes: new `/account/notifications`, `/admin/notifications` and signature-verified `/api/webhooks/resend`; bounded same-origin `/api/user/notification-preferences` now uses canonical consent. Server-only batch entrypoint has no public worker endpoint or installed scheduler.

| Validation | Final result |
| --- | --- |
| Complete unit suite | **1,881 PASS**, includes **82 email regressions** |
| Native PostgreSQL/provider-ownership suite | **82 PASS**: four email cases plus 78 inherited cases |
| Existing security / release gates | **300 + 5 PASS** |
| Clean native migration replay | **66 exact files PASS**, default email/media/finance/commerce remain disabled |
| Chromium | **128 journey groups / 13 system suites PASS**, plus both inherited chart suites; zero page runtime errors |
| Final email browser replay | Eight groups PASS; all 45 notice kinds rendered; approved logo actually loaded |
| Typecheck / lint / isolated production build / diff check | PASS; one inherited React Hook Form lint warning |

`npm run build` still fails its existing global port-3000 guard because an unrelated `kedlaw-studios-web` server owns that port. It was preserved. Equivalent `node node_modules/next/dist/bin/next build` passed in the isolated TSE worktree. Native environment: Darwin ARM64, PostgreSQL 17.11, Node 24.14.1 with the pinned Supautils authority fixture. This is not Linux Phase A or hosted execution. Firefox/WebKit were unavailable locally; actual email-client/screen-reader acceptance remains separate. Legacy fixture-only unsupported Admin-home queries were not treated as verified data; requested email screens used actual SQL/RLS.

Security evidence covers recipient/role/address changes, unverified email, missing/failed payment, original acceptance bindings, private schema/RPC denial, current Admin MFA, injection, signature forgery/replay/conflicts, concurrent collectors/workers, interrupted acknowledgements, retry digests/windows, source revocation, refunds/disputes, suppression, preferences and late delivery after pruning. No known critical local email defect remains from these scoped checks. This is local engineering verification, not independent security/privacy/accounting acceptance; inherited dependency/review findings remain open. No dependency versions changed.

Command Center: **122 cells written/read back**, **2,870 captured cells outside the edits unchanged**. Engineering row45 is Complete — Not Live; Blueprint rows839–849 record separate implementation, validation, hosted and acceptance states. All **25 formal QA scenarios remain Not Run**. All **53 qualification records / 212 stage cells**, the Founder Actions QUERY and all four complete chart specifications/positions are preserved. Native Sheet visual inspection required Google reauthentication; API values, validation, styles and structure were checked instead. No rendered native-Sheet visual claim is made.

Remaining before any real delivery or release: separate founder authorization for isolated provider/SMTP and migration rehearsal; verified sender/domain/SPF/DKIM/DMARC, monitored reply-to, dedicated credentials/webhook account binding, reviewed SiteURL/redirects/token expiration and native security toggles; actual Auth MIME/plain alternatives and dual-email-change delivery; scheduler/quotas/staleness/dead-letter monitoring, suppression/retention/erasure approval, real mailbox/client/device/accessibility testing, independent review and formal founder acceptance. Marketing copy/legal sender footer and one-click unsubscribe must be reviewed before any future campaign. Phase A custody/quota/budget holds remain unchanged. System 14 was not started.

Evidence: `/Users/malcolmw/Documents/The Sync Exchange.2/output/system13-email-notifications-2026-10-24/`. Exact final paths/hashes are in `file-inventory.json`; the exact 55 implementation staged files and `git show --stat --oneline` are in `implementation-staged-files.json` and `implementation-git-show-stat.txt`. The report adds one documentation file. All **21 pre-existing workspaces**, including the founder workspace's **25 dirty tracked files**, retain their original heads/status/content hashes. The System 13 worktree is clean after the report commit.

Detailed source/recipient/retry/retention contracts and controlled hosted handoff: `docs/notifications/system13-contract.md`. Public provider documentation references are recorded there. Local completion does not authorize hosted delivery, Private Beta or System 14.
