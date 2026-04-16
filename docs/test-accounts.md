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
- confirms email immediately
- sets app/user metadata role
- upserts `user_profiles`
- upserts `artist_profiles` and `buyer_profiles` where needed
- marks onboarding complete for QA flows

## Optional overrides

Set these in `.env.local` if you need different identities:

- `QA_ADMIN_EMAIL`
- `QA_ADMIN_FULL_NAME`
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
