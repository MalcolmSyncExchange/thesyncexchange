# Onboarding, buyer discovery and artist dashboard changes

## Result

Signup presents a shorter mobile introduction and role choices before the form. Existing required onboarding fields and server-controlled role transitions remain in place. Progress identifies the current step without implying it has been saved; buyer completion leads with Explore Music. Hidden choice inputs have visible keyboard focus and form errors are announced.

The buyer catalog supports compact audition rows, optional secondary filters, removable filter chips and no-result recovery. Saved genre/mood interests that match available catalog values can be selected as search filters. Search includes mood. Minimum eligible license pricing drives display, budget matching and price sorting consistently, including zero overrides and missing-price handling.

A single buyer-layout audio element provides preview, pause, seek and error feedback across client-side navigation. Catalog filters survive those navigations; a full reload starts a new browsing session. The player only receives public preview assets, never private master paths. Favorites optimistically update, report success, and roll back when the server action fails. The buyer dashboard now identifies catalog selections accurately and displays the actual approved-catalog count.

## Scope and boundaries

No migrations, new API routes, RLS changes, authentication-policy changes or payment changes. Existing favorite action changes only add database-error reporting. Saved interests use the existing authenticated profile loader and only genre/mood strings are passed to the browser. No production writes, secret changes, merge or deployment were performed.

Artist dashboard option 3 is integrated after design approval. Overview begins with account-wide catalog totals, followed by the selected-track journey and recent submissions. My Catalog retains its dedicated catalog view. Submit Music opens the existing detailed submission form; track actions open the existing editor. Rights and payout links open their existing routes. Dashboard client props include presentation fields only, excluding private audio paths, rights-holder contacts and moderator metadata. Rejected and archived states never appear as drafts. The original local prototype and screenshots remain review artifacts excluded from Git.

## Validation

- `npm run test:unit`: 196 passed, 0 failed, including five discovery tests and four artist-dashboard tests.
- `npm run test:discovery`: five passed.
- `npm run test:artist-dashboard`: four passed (all status mappings, whole-catalog counts, client data projection, initial/empty selection).
- `npm run test:buyer-onboarding`: seven passed.
- `npm run typecheck`: passed.
- `npm run lint`: no errors; one existing React Hook Form compiler warning in `components/forms/submit-music-form.tsx:173`.
- `npm run build`: default Turbopack build could not complete in this environment because its worker could not bind a local port (EPERM).
- `npx next build --webpack`: passed; 48 static pages generated and dynamic routes built.
- `git diff --check`: passed.
- Artist prototype `npm run build`: passed.

Final production-build smoke checks confirmed the buyer catalog search and existing artist catalog both render after separating their components. Browser checks used local demo mode: mobile signup, mood search, combined filter zero-results/reset, favorite feedback, preview playback/pause/seek/end, one-player switching, detail/back navigation preserving player and query, and no browser console errors. Playback used a temporary silent local audio fixture which was removed after verification. Favorite UI feedback was exercised in demo mode; real database persistence was not tested. Artist prototype was checked at desktop and 390px mobile widths, including simulated submission, first upload, status filters, feedback and Escape/focus restoration.

## Before production release

Use a Netlify Deploy Preview with authorized buyer and artist accounts to verify real saved interests, signup/email confirmation, onboarding completion, favorite persistence/failure, and public preview URLs. Confirm required Supabase redirect URLs for that preview. No SQL or environment-variable changes are required by this patch. Keep payment verification in Stripe test mode. Verify the integrated artist dashboard with real draft, review, approved, rejected, archived and empty catalogs. Existing payout settings are read-only; expanding payout management remains a separate task. Review notes remain admin-only and are not exposed as artist feedback. Full screen-reader and zoom testing remains outstanding.

## Artist integration browser checks

On the built app in local demo mode, verified Submit Music opens the complete metadata/upload/licensing/splits form, selected submissions open their matching editor, Rights opens split management, and Payouts opens the existing read-only payout profile. Selecting an In review row updates the main journey. Desktop and 390px mobile screenshots were inspected; mobile DOM has no horizontal overflow. Browser console errors: none observed. These checks did not submit files, alter rights, modify payout data or test live backend writes.
