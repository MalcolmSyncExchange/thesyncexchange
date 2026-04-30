# Production Smoke Test

Use this checklist against the deployed environment after production configuration is complete.

## Before you start

- deployment URL resolves correctly
- `npm run validate:env` passes in the deployment environment
- Supabase readiness endpoint is healthy
- Stripe production or test-mode keys are set intentionally
- Supabase custom SMTP is enabled and tested
- admin bootstrap account exists

## Smoke test steps

1. Open the deployed homepage.
   - Confirm the page loads without a 500 and the primary logo renders correctly in light and dark mode.

2. Confirm there are no blocking console errors.
   - Check the browser console on the homepage and login page.

3. Sign up as an artist.
   - Use a fresh inbox you can receive mail in.

4. Confirm artist email delivery.
   - Open the signup confirmation email.
   - Verify the branded interstitial page loads at `/auth/email-action`.
   - Continue through to `/auth/confirm`.

5. Complete artist onboarding.
   - Basics
   - Profile
   - Licensing
   - First track
   - Complete

6. Upload an artist avatar.
   - Confirm the file stores successfully and persists after refresh.

7. Submit a track.
   - Cover art upload
   - Source audio upload
   - Preview upload
   - Rights holders sum to 100%

8. Log in as admin.
   - Confirm admin dashboard loads.

9. Approve the submitted track.
   - Confirm it leaves the review queue and becomes buyer-visible.

10. Sign up as a buyer.
    - Use a second fresh inbox.

11. Confirm buyer email delivery.
    - Test the same branded email-confirmation flow.

12. Complete buyer onboarding.
    - Basics
    - Buyer profile
    - Interests
    - Complete

13. Find the approved track in the buyer catalog.
    - Confirm catalog visibility and track detail rendering.

14. Start Stripe checkout.
    - Confirm the hosted Stripe page opens.

15. Complete checkout.
    - Use the intended mode:
      - test deployment: Stripe test card
      - live deployment: controlled real payment method approved for launch testing

16. Confirm webhook fulfillment.
    - Order status changes from `pending` to `paid` / `fulfilled`
    - No webhook error is recorded

17. Download the agreement.
    - Buyer can open the agreement
    - Signed/private delivery works

18. Confirm admin can view the order.
    - Admin dashboard or orders page shows the order and lifecycle details.

19. Test forgot password.
    - Request reset
    - Confirm email arrives
    - Complete password update
    - Sign back in

20. Test responsive and branded surfaces.
    - Mobile nav
    - Light/dark logo switching
    - Login
    - Signup
    - Buyer catalog
    - Buyer checkout
    - License confirmation

## Pass criteria

- no silent failures
- no broken redirects
- no stale pending order after successful Stripe payment
- agreement delivery works only for the authorized buyer and admin
- admin can see submission + order activity
- password reset mail arrives and completes successfully
- no visible placeholder or TODO language remains in user-facing flows
