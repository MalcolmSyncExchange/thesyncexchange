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

## Artist visual correction

The first integration kept the original centered AppShell, which did not match the approved option 3 prototype. The artist layout now uses a dedicated full-height sidebar with icon navigation, Overview/My catalog/Submit music/Rights holders/Payout settings labels, a compact account header, and wider content. Scoped CSS restores the prototype's heading scale, connected submission progress, semantic status colors, and grouped recent-submission rows. Profile, logout and theme controls remain available. The buyer workspace now shares this shell; admin retains its existing shell.

Account-wide totals remain above the submission journey as requested. Actual cover art, track statuses and existing detailed submission/editor routes remain connected. No authentication, services, database or payment behavior changed in this visual correction.

Rechecked the production build in local demo mode at 1487×1058 and 390×844. Compared matching Live states with the approved prototype, acknowledging real catalog content and the account-total addition. Corrected sidebar overflow and uppercase eyebrow text after the initial comparison. Verified mobile navigation, Escape/focus restoration, all six artist destinations, selected In review state and its editor route, and light/dark appearance. No browser console errors or page overflow observed. Final build passed; 196 unit tests, typecheck and lint passed (one existing React Hook Form warning). Local screenshots and the detailed QA report are excluded from Git.

## Homepage, signup and buyer visual alignment

The homepage, account creation pages and buyer workspace now follow the approved artist option 3 direction: restrained dark surfaces, larger headings, cyan actions, thin grouped borders and consistent spacing. The homepage separates buyer and artist entry points and describes discovery, shortlisting and licensing without fabricated catalog metrics. Signup exposes role switching before the form and retains existing signup, session notice and confirmation behavior. The shared auth layout also carries the visual treatment into login and recovery.

Buyer Overview adds a search form that opens Discover music with the submitted query, actual account counts, catalog audition rows and a saved-track shortlist. Discover music, Saved tracks, Licenses & orders and Account settings share the artist navigation shell. Account settings includes section links. The persistent player is offset beside the desktop sidebar and spans the screen on mobile. Existing track-detail, checkout and settings handlers remain unchanged.

Buyer settings now uses the existing demo profile when explicit demo mode is enabled, after the existing buyer session check. Its production authenticated data loading is unchanged. No migrations, API routes, payment configuration or production environment changes are needed.

Validation for this follow-up: 196 unit tests passed; typecheck passed; final lint passed with the existing submit-music React Hook Form warning; final webpack production build passed (48 static pages); diff whitespace check passed. Browser QA at 1487×1058 and 390×844 covered homepage role links, mobile menu/Escape/focus restoration, buyer/artist signup switching, blank signup validation, overview search into catalog, saved tracks, orders, account settings and player persistence/placement. Final signup buttons are 48px high and login footer text remains inline. Screenshots were compared side by side with the approved artist screen. No horizontal overflow was observed on checked mobile routes.

The demo audio source was unavailable during this follow-up, so its error state and navigation persistence were verified, not successful playback. Real signup/email confirmation, settings mutations and live favorite persistence remain Deploy Preview checks with authorized test accounts. No accounts were created, credentials changed, purchases made or settings saved during browser QA. Payout expansion remains deferred pending the payment model decision.
