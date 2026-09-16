# Test Accounts

The repo includes a QA account bootstrap script:

```bash
QA_TEST_ACCOUNT_PASSWORD='your-strong-local-password' npm run seed:qa-accounts
```

## Default accounts

- admin: `qa-admin@thesyncexchange.com`
- artist: `qa-artist@thesyncexchange.com`
- buyer: `qa-buyer@thesyncexchange.com`
- wrong buyer: `qa-buyer-two@thesyncexchange.com`

All four use the same password from:

- `QA_TEST_ACCOUNT_PASSWORD`

## What the script does

- creates or updates the auth users through the Supabase admin API
- confirms newly created accounts immediately; existing admin accounts must already be confirmed
- sets app/user metadata role
- upserts `user_profiles`
- upserts `artist_profiles` and `buyer_profiles` where needed
- marks onboarding complete for QA flows

## Optional overrides

Set these in `.env.local` if you need different identities:

- `QA_ADMIN_EMAIL`
- `QA_ADMIN_FULL_NAME`
- `QA_ADMIN_USER_ID` (required for an existing admin account; obtain from an independently verified Auth identity)
- `QA_ARTIST_EMAIL`
- `QA_ARTIST_FULL_NAME`
- `QA_ARTIST_NAME`
- `QA_BUYER_EMAIL`
- `QA_BUYER_FULL_NAME`
- `QA_WRONG_BUYER_EMAIL`
- `QA_WRONG_BUYER_FULL_NAME`
- `QA_RESET_PASSWORDS=true`

## Recommended use

- use the artist for submission QA
- use the buyer for normal purchase QA
- use the wrong buyer to verify agreement access controls
- use the admin for moderation, order visibility, and manual recovery checks


## Existing admin identity safety

Both `seed:qa-accounts` and `create:admin` refuse to promote an existing account
by email alone. Before a rerun, verify who controls the account, then set
`QA_ADMIN_USER_ID` or `ADMIN_BOOTSTRAP_USER_ID` to that account's Auth UUID.
The email and confirmed identity must match. A supplied UUID with no matching
account fails closed instead of creating a replacement account. New accounts
can still be created without a UUID using the operator-supplied password.
Existing passwords remain unchanged unless the corresponding reset flag is set.
The generic SQL seed no longer creates admin profiles from matching emails.

These local guards do not establish whether older bootstrap runs affected a
production account. Before reusing existing production admins, an authorized
operator must review the canonical admin user IDs, Auth email confirmation and
creation times, account ownership, and relevant bootstrap/auth audit history.
Email confirmation alone is not proof of intended administrative ownership.
Do not run these scripts or change production accounts as part of a read-only audit.
