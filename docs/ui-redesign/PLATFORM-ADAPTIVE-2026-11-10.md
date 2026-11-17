# Adaptive desktop and phone interface

Current review revision: see `APPLE-ADAPTIVE-PREVIEW-2026-11-10.md`. The secure sample-data preview is at https://adaptive.budgit.duckdns.org/next?year=2026&month=10. Current draft-preserving navigation has been integrated; the older pending-integration notes below describe the first prototype checkpoint. Production approval is still required.

Implemented in the isolated `codex/platform-adaptive-ui` branch from `40ad892`. **Not published.** The active `work/budgit-household-ui` checkout has concurrent form-draft work; preserve and integrate that work before release. This branch is not a replacement source for deployment over those changes.

## User-visible behavior

Desktop uses a persistent right-hand sidebar with direct, mode-filtered links to the existing tools. Its expanded/collapsed setting is remembered per device. At 768px the desktop navigation replaces the bottom tabs; the main workspace can grow to 1600px. Overview and accounts use complementary columns at 1100px. Forms retain readable widths. No user-agent detection is used; resizing responds immediately.

Phones retain the four main tabs. Intentional horizontal swipes on noninteractive main-page content move to an adjacent tab in RTL order. Tab switching replaces the root tab history entry; detail routes retain the existing push/Back stack. Gestures do not start on controls, carousels, charts, horizontal scrollers or within 28px of either screen edge. Vertical intent, multitouch, cancellation, dialogs, pending navigation and running saves abort the gesture. Browser edge navigation and pull refresh retain their existing behavior. Native browser Back continues through the existing React Router draft blocker. The header retains an accessible Back fallback because standalone iPhone PWAs do not provide a uniform system Back affordance.

Accounts have bank/card sections on phones and complementary columns on desktop. Section choice and selected wallet card remain separate and scoped. Card metadata is divided into name/alias, issuer/club, billing/payer and optional fees. Bank metadata separates identity from opening balance/buffer. Manual monthly reporting separates amounts from inclusion/actual-data decisions; recovery tools are expandable. Every section stays mounted, so partial/invalid input survives section changes and resizing. Desktop shows form sections together. Metadata editing uses a focused phone screen with a sticky existing save bar, no bottom tabs and no redundant display-period picker; the selected period remains in route context. The card preview is expandable.

Other editors keep their existing structure. This is not a claim that every workflow has been converted into a wizard or that physical iPhone gestures have been accepted.

## Existing behavior reused

- `household-navigation.tsx`, `household-model.js`, `link.tsx` and `navigation-query.js` retain original destinations, scope/period filtering and return trails. Desktop uses the same menu data as More.
- React Router and `draft-guard.tsx` retain navigation/Back protection. No new history interception, automatic financial saves or separate draft engine.
- Existing `account-command`, `card-command` and `monthly-report` commands, explicit saves, role checks, conflict recovery and financial meanings remain unchanged.
- Existing wallet gestures, card flips, selected-card scroll handling, refresh and light/dark settings remain.

## Verification

- `node build.mjs`: build and TypeScript passed.
- `node --test test/*.test.mjs tools/bank-csv/*.test.mjs`: 1,426 passed.
- `node verify.mjs`: 15 passed.
- Focused gesture/carousel/navigation/draft tests passed after final changes.
- `scripts/check-platform-browser.mjs`: synthetic local-service Chrome checks at 320, 390, 768, 1024, 1440 and 1920px in both themes. No horizontal overflow, correct navigation surfaces, broader desktop workspace, focused phone sections, unchanged partial input, guarded browser Back, live resize, persisted sidebar choice, keyboard skip, RTL swipes, nested-carousel exclusion and reduced motion passed. Zero financial writes and byte-identical financial records; no runtime errors.
- The browser script accepts `PLAYWRIGHT_MODULE` for the locally available Playwright package and closes its browser/service in `finally`. No production account is used.

Evidence: `evidence/platform-adaptive-2026-11-10.json`. Local synthetic screenshots are under `/tmp/budgit-platform-qa/`.

## Integration and publication

Merge the presentation changes with the separately completed draft-persistence work, preserving its current registry/hook contracts and all newly supported editors. Resolve the shared `main.tsx`, account/card/monthly form edits deliberately; do not restore this branch's older draft implementation over the new one. Re-run integrated build, regressions and browser Back/section/draft checks. Then apply the established current-live source reconciliation, fresh verified backup, isolated preflight/rollback and production verification procedure. No production, Sites, financial records, resources or primary fork-export branch were changed by this checkpoint.

## Review before publication — user direction, 2026-11-10

Keep a minimal chevron Back button on secondary screens, with a 44px touch target and accessible label. Browser/phone Back remains available too. Tal explicitly requested reviewing the new design before replacing the current design. This overrides standing production-publication authorization for this redesign: do not deploy it to the live app until Tal approves the reviewed result.

Run `node scripts/preview-platform.mjs` after `node build.mjs` for a local interactive preview at `http://127.0.0.1:5178/next?year=2026&month=10`. It seeds only synthetic records into a new in-memory SQLite database. Sample edits reset on process restart. No production configuration or credentials are loaded. Use `PLATFORM_PREVIEW_HOST=0.0.0.0` to allow phone review on the same local network; the script prints the available LAN URLs. External account connection and upload endpoints are refused. This preview is not published to the production website.
