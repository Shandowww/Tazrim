# React migration checkpoint

Date: 2026-10-26. Plan: `docs/TAZRIM-FRONTEND-REPLACEMENT-PLAN.md`.

## Source and status

- Active managed worktree: `/Users/talshandor/.codex/worktrees/tazrim-react-frontend/monthly-flow`, branch `codex/tazrim-react-frontend`. Implementation checkpoints: `6242d53` (charts/refresh), `6601d4e` (bank/card rows and space-preserving navigation). Earlier work was prepared in `/tmp/budgit-tazrim-react` and backed up to this branch.
- Canonical repository: `/Users/talshandor/Documents/personal-projects/monthly-flow`; its working tree was already mixed/dirty. No canonical files were changed by the implementation checkout.
- Pinned Tazrim reference: `/tmp/monthly-flow-tazrim-reference`, `7f3a9edb60f1c1a723213049f20d9b5869fc599e`.
- The managed worktree is now writable and was checked out to the backed-up branch. No canonical working files were edited.
- Running production release is unverified in this task. Do not deploy until it is rechecked.

## Completed

- Task 1 feature inventory and release distinction drafted. Source links, planned routes, role/privacy checks and known read-only limits are in `feature-parity.md`.
- Task 2 foundation: a static Vite/React build with pinned Tazrim sidebar, phone nav, summary cards, rolling number, tokens, Heebo and background; source and licenses recorded in `provenance.json`. Navigation imports have explicit React Router replacements. Budgit name and logo are shown. Synthetic records exist only in development fixture mode.
- Task 3 foundation: the existing Budgit server serves `/next/` and `/ui-assets/` after session and allowlist checks. Original `/` and `/api` paths retain their handlers. The React dashboard loads a personal plan through existing `/api/plan` and derives read-only actual totals with `src/tazrim-display-model.js`; encrypted budgets link to the existing secure interface. No write commands have been added.
- Task 4 read-only state foundation: the shell fetches permitted spaces from `/api/budgets`, shows a space picker and loads the selected plan by ID. Results are scoped to the selected budget and checked against the same account identity; older requests are aborted. Endpoint contracts are recorded in `api-contracts.md`.
- Task 5 partial: the pinned Tazrim period picker and two dashboard charts render Budgit's actual monthly series. Missing months remain gaps while reported zero stays zero. The chart bundle loads separately. System/Light/Dark appearance applies immediately and remembers the device choice. Read-only refresh keeps the previous snapshot on a transient failure and offers a top-layer retry notice; initial/access errors also appear above navigation. Expired or revoked access clears the private view. Bank/card list and preliminary detail routes use pinned Tazrim account faces and summary rows, scoped to Budgit's saved account IDs. Unknown balances and card charges remain missing. The large detail face now uses Tazrim's actual component; its glass variant uses the static source CSS until the baked renderer is ported. React navigation retains the selected budget space.
- Asset build is included in `node build.mjs` and the existing Docker build. Frontend `dist` and `node_modules` are ignored, while package lock and source are tracked.

## Checks completed

- `node build.mjs`: success, including frontend TypeScript/Vite build.
- `node verify.mjs`: all 15 checks passed.
- `node --test test/*.test.mjs`: 620/620 passed with local loopback permission. Initial restricted run had 6 environment-only failures because test listeners could not bind `127.0.0.1`; the permitted rerun passed all.
- New `test/tazrim-react-adapter.test.mjs`: 2/2 passed after the full run, verifying actual spending/card/saving/transfer separation and honest empty banks.
- New `test/tazrim-react-budget-load.test.mjs`: 2/2 passed after the full run, verifying permission-before-plan lookup and identity consistency.
- Tazrim display model 6/6 and authenticated asset/route test passed within the full run.
- `git diff --check`: clean.
- Current worktree: `node build.mjs` passed with frontend TypeScript/Vite build; `node verify.mjs` passed 15/15; focused display/React tests passed 13/13, including missing versus reported zero, account scoping and selected-space navigation. `git diff --check` passed. An earlier verification attempt raced the build and failed because `dist/server/index.js` had not yet been generated; the sequential reruns passed.

## Pending and limits

- This is an **incomplete read-only development checkpoint**. Several `/next/` routes are clearly marked pending; no edits, report workflows, shared-space management or vault unlock have been ported. Bank/card list rows work but the animated wallet, full account details and setup/edit flows are pending. Do not publish or make it the default.
- The development branch `codex/tazrim-react-frontend` is backed up to GitHub through implementation commit `6601d4e`. The currently running production release has not been checked in this task. No production backup, server update or Sites update has occurred.
- Browser visual review was attempted again through the authorized in-app browser. The Mac was unlocked after Tal's reply, but Work still returns `Local browser use is disabled in Work settings`. Do not substitute other browser automation or claim visual acceptance.
- The temporary standalone Vite dev server was started on port 5174 but localhost requests from this execution context were denied; its UI has not been inspected.

## Next bounded actions

1. Finish task 3 with a local authenticated preview and visual evidence when browser access works. Verify static asset paths and bank empty state in the rendered UI.
2. Task 4: finish identity/space-aware request state and add a draft/navigation guard before any write screen.
3. Task 5: finish the Tazrim bank/card wallet and detail pages with actual Budgit data. Keep the real source components and reconcile financial labels.

## Wallet and visual checkpoint — 2026-10-27

Continued from `182de01` in an isolated exact-source directory; canonical private/shared-space backend remains separate. Ported pinned upstream `components/cards/card-wallet.tsx`, wallet-motion helpers and the complete baked-glass renderer/background helpers, retaining MIT/OFL provenance. Explicit React Router boundaries replace Next links/pathname/prefetch; wallet links carry budget/period/development-fixture state. Bank/card list and detail routes now share the actual animated wallet and original account faces. Wallet code loads as a separate route chunk. Budgit icon and pocket branding remain Budgit.

Bank hero uses only an actual dated balance; card hero and pocket totals require known actual amounts. Unknown totals clear the previous value, including same-card period changes, and are hidden from accessibility rather than announced as zero. Account-row accessible names include reported balances/charges/expenses or explicit missing data. The bank pocket deliberately does not sum balances across differing report dates. Its label is “חשבונות הבנק”; no consolidated balance is claimed. Four-digit aliases are reused exactly; arbitrary names/aliases do not become guessed card numbers. Existing-editor links explicitly select the current personal/shared budget.

Fixed Vite's development URL mismatch (`/next/` router versus production `/ui-assets/` prefix), broken preview icon and dashboard sample links losing fixture mode. Production asset/auth prefixes are unchanged. No new financial writes or backend changes were added.

Browser access works in this chat as of this checkpoint; the previous access blocker is superseded for these checks. Real built app handlers ran against disposable in-memory synthetic records through a read-only loopback preview. Checked bank/card stack and hero, exposed-face touch, keyboard activation, back navigation, year changes known→missing→known, source-space removal after switching to an empty shared space, immediate Light/Dark selection and phone More-sheet navigation. At 320/390/430/768/1440 widths, checked the bank/detail layout and document overflow; inspected phone light and desktop dark captures. Built preview logged no JavaScript errors. Screenshots: `/tmp/budgit-react-wallet-phone-light.png`, `/tmp/budgit-react-wallet-desktop-dark.png`. Development HMR produced a duplicate-root warning during edits; final built-page checks were clean. No real iPhone test, reduced-motion browser emulation, complete upstream side-by-side comparison or full release acceptance is claimed.

Final build/typecheck, **629 regression tests** and all **15 core checks** passed. Two added adapter/bridge tests verify exact four-digit alias reuse without plan mutation, explicit personal/shared editor destinations and fixture/period/space navigation retention. Existing auth/asset isolation and financial checks remain passing.

**Still incomplete and not deployed.** Task 5's category/source-report/search screens, full wallet account setup/editing and task 4's draft navigation contract before write screens remain pending, followed by editing/report/savings/security/settings parity, reconciliation with the newer canonical backend and full release acceptance. The old handwritten display was rejected in favour of this React replacement; do not deploy that prototype merely to show a newer design. No production or Sites update occurred. Next work should start from the new pushed frontend checkpoint, not reset to the older managed checkout tip.
