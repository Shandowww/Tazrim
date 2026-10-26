# Report Center as the primary intake path

Tal clarified that issuer email notifications mostly contain account-login links, and requested keeping Gmail secondary in Settings, retaining Apple Pay in its existing place, and making report uploads the main workflow.

## Result

- Status has a direct Report Center action; the app menu continues to list Report Center first under activity.
- The initial welcome leads to the combined bank/card Report Center. Manual setup and backup import remain available.
- An empty Report Center lists current-budget unfinished stored reports and can resume their saved decisions. Completed/archived reports, another budget's cached list and an already loaded intake draft are excluded. Upload remains above the saved queue. Queue refresh preserves a focused queue control and never replaces the intake draft.
- Gmail is retained as a separate optional Settings page, reached through Connections and import → Additional connections → Gmail settings. Bank notices move with it. Existing enabled mailbox connections retain their behavior; no connection is created, paused, disconnected or granted new scopes by this update.
- A disconnected/paused Gmail connection does not create an action-center error. An active failed scan remains actionable as a non-blocking issue; details and connection controls remain on the Gmail page.
- Apple Pay keeps its existing Connections entry and behavior. Manual input remains for corrections and missing details.
- Link-only Cal email tasks (U6) remain planned at a lower priority. Gmail access does not download a report behind issuer login, and email receipt is not a source/import receipt.

## Verification

549 Node tests and 15 build/verification checks passed in an isolated checkout containing the canonical tracked Apple Pay installer. The canonical working copy's pre-existing installer deletion was left untouched. Tests include draft/scope guards, resume behavior, optional Gmail failures, existing financial/source/revision contracts, and the development Shortcut tooling.

Actual browser checks used an in-memory synthetic budget and report only: Status → Report Center → unfinished report → resume pending account selection; Connections → existing Apple Pay → collapsed Additional connections → separate Gmail Settings. No real Google/issuer login or real financial record was used. No browser console errors were recorded. A temporary 390×844 viewport override was requested; the browser reported an effective 433 CSS-pixel width with scrollWidth 433, so this is a narrow browser layout check, not proof of an actual iPhone or exact 390 CSS pixels. The temporary viewport is reset after testing.

Screenshots and full test log are local evidence, excluded from the source backup:

- `outputs/report-primary-2026-10-19/status-mobile.png`
- `outputs/report-primary-2026-10-19/report-center-mobile.png`
- `/tmp/budgit-report-primary-final-tests.log`

## Still pending

The daily folder Shortcut has generated/signed development drafts and synthetic intake tests, but its full native run stalls at the folder `File` action before uploading. It is not published as an installer. See [native QA evidence and remaining checks](REPORT-SHORTCUT-QA.md). This draft does not download statements from issuer websites.

Real-device/VoiceOver, actual source-and-draft backup evidence, and full-host Google/vault recovery remain the user-dependent acceptance work already recorded in [the user action guide](USER-ACTIONS-TO-COMPLETE-2026-10-18.md). Gmail consent is optional for the primary upload path. No automatic deletion, paid resource upgrade or Sites update is included.

Publication uses the standing Budgit + GitHub authorization, with a fresh consistent SQLite backup, isolated preservation/access preflight and compatible rollback image. Per-release archive/runtime hashes and actual deployment results are retained in the local release receipt; a passing build alone does not confirm publication.
