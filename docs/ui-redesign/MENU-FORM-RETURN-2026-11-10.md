# Menu review and completed-form returns — 2026-11-10

## Status

Application `73fa5aa` is verified live after Tal requested publication. The prior application `f7bf3ba` carousel flash/scroll repair is retained. Fresh verified backup, isolated release/rollback gates, all 50 authoritative tables, keys/configuration and adjacent services passed preservation checks. Evidence: `docs/ui-redesign/evidence/release-menu-form-return-2026-11-10.json`. Source and release records are backed up to GitHub; no production financial edits, Sites or resource changes were performed. The outer checkout's unrelated work is preserved.

## Menu audit

- Removed More → Accounts: it repeats the persistent Accounts tab/sidebar destination. The implementation routes to `/accounts`, not the `/` overview; neither primary destination was removed.
- Retained the remaining tools because they perform distinct operations. Future income distinguishes monthly estimates from one-off income; planned items, recurring charges, loans and cheques have different records/workflows. Sync Center, saved source library and import history are not interchangeable. Categories, analysis, search and investment simulation provide different views/tools. Transfers, payer assignments and the cross-space overview are not duplicates of the current-space home page. Settings, space sharing and Help remain accessible.
- Added regression coverage proving that retained menu links resolve to existing routes and retain the selected space/period. No placeholder destination was substituted and mode filtering remains active.

## Editing existing cards

The existing editor was already connected at `/card-setup/:id`, but its wallet action was inside the selected card's **פרטים ופעולות** disclosure. Both this editor and the management list were hidden in Basic mode.

The selected card now has an immediately visible **עריכת פרטי הכרטיס** link beside its heading. The original detailed actions and management list remain. Card management/editing and bank-account editing are now available in Basic too, consistent with already-available creation. Role, account identity, source/financial validation and revision checks remain unchanged; viewer accounts still receive no editing action.

## Completed record forms

Bank accounts, credit cards, cheques/manual details, loans, planned items/income and savings-goal forms return to their actual prior in-app page after an acknowledged save. Both creation and editing are covered, together with existing supported removal/clear actions on these pages. The empty loan register's embedded creation form also returns to its actual prior page; direct entry without a trail falls back to the loan register rather than opening the newly created editor.

`useSavedReturn` reuses the existing draft registry and scoped navigation trail. It does not save records itself or replace financial commands. It waits until all registered drafts are clean and idle; an explicit **Save and Continue** destination takes priority. A late result from another actor, budget or route cannot navigate the current page. Errors, conflicts and uncertain results retain the existing editor/retry behavior and do not acknowledge a return. Direct links without an origin use the existing parent-page mapping, with a manual-detail fallback to its register.

The return preserves the origin's period, scope, selected wallet card and supported presentation filters. The saved form is replaced, so subsequent in-app Back does not reopen it. A success receipt appears on the destination only for the exact saving actor and budget. Loading an earlier success message does not trigger another return. Multistep report/import and security/settings workflows retain their existing completion behavior; this is not an automatic exit from every intermediate review or local draft operation.

## Validation

- `node --test test/*.test.mjs`: 1,332 passing, zero failures/skips.
- `npm --prefix frontend run typecheck`: passed.
- `node build.mjs`: passed, including TypeScript/Vite.
- `node verify.mjs`: all 15 core checks passed.
- `git diff --check`: passed.

New focused contracts cover menu duplication/destinations, visible selected-card editing versus viewer read-only access, safe origin/fallback selection, return filters/period, draft/busy waiting, explicit navigation priority, stale actor/scope/route refusal and private success receipts. Financial save/recovery/isolation/conflict suites remain passing. Existing build warnings remain; no browser, physical-iPhone, touch or production acceptance is claimed for this task.

Publication: 148 built-candidate contracts, 982 prior-source matches and 169 candidate/live runtime matches passed. Public health, anonymous/forged access refusal, root/deep routes, manifest and signed installer checks passed. No new browser or physical-iPhone acceptance is claimed. Save drafts and use the guarded app refresh.
