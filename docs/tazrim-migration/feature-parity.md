# Budgit to Tazrim frontend: feature inventory

Baseline for this inventory: canonical `3c1bc74fea923e9836420da6abc31d4a3cad2bce`, 2026-10-26. The only **verified live** source recorded by the Tazrim work is `a79488ba465e6061edeb542aa22e40b852489631`; recheck the server before any release. This checkout is a clean clone of the canonical commit, excluding its numerous uncommitted changes. Entries marked “baseline” exist in this commit, not necessarily in production. Some shared-space milestones remain read-only or unfinished by design.

Status codes: **B** = in baseline commit; **R** = read-only by design; **L** = legacy/preview-only bridge until ported; **U** = live release status must be verified. The React destination is a planned route, not a claim that it exists.

| Workflow | Current source / check | React destination | Access and completion evidence | Status |
| --- | --- | --- | --- | --- |
| Sign-in, logout, account identity | `server/app.mjs`, `server/auth.mjs`, `src/client.js` | shell `/next/` | Existing authenticated session; anonymous and forged ID denied; no private data after logout | B/U |
| Demo and onboarding | `src/onboarding.js`, `src/client.js` | `/next/`, `/next/start` | Sample-only banner; untouched demo navigates; no demo save to production | B/U |
| Budget/space switch and viewer role | `src/spaces.js`, `src/spaces-worker.js` | shell switcher, `/next/spaces` | Space and role clear in header; viewer writes denied; draft guard | B/U |
| Combined space overview | `src/space-overview-client.js`, `src/space-overview-model.js` | `/next/spaces/overview` | Read-only, no cross-space total or locked data | B/R/U |
| Current status and income/expense chart | `src/home.js`, `src/status-model.js` | `/next/` | Actual-only achievements; missing months distinct from zero | B/U |
| Monthly input and card totals | `src/client.js`, `src/cash-accounts.js`, `src/budget.js` | `/next/monthly` | Explicit save, revision conflict, no individual rows required | B/U |
| Bank accounts and balances | `src/cash-accounts.js`, `src/budget.js` | `/next/banks`, `/next/banks/:id` | Scoped by stable ID; empty state and setup; balance date visible | B/U |
| Credit cards, billing dates and report rows | `src/cards.js`, `src/card-billing-client.js` | `/next/cards`, `/next/cards/:id` | Card charges are breakdown, not extra expenses; refunds signed | B/U |
| Expense categories and caps | `src/details.js`, `src/merchant-categories.js` | `/next/categories` | Partial breakdown warnings; caps are not bank totals | B/U |
| Cheques | `src/details.js`, `src/budget.js` | `/next/cheques` | Included versus separate accounting and cancellation | B/U |
| Planned purchases and installments | `src/planner.js`, `src/budget.js` | `/next/plans` | No duplicate card charge; fees counted once | B/U |
| Purchase calculator and trial scenarios | `src/planner.js`, `src/client.js` | `/next/calculator` | Trials local until applied/saved; draft navigation guard | B/U |
| Cash forecast and buffer | `src/budget.js`, `src/client.js` | `/next/forecast` | Forecast label; no achieved celebrations | B/U |
| Savings contributions and combined goals | `src/savings.js`, `src/savings-accounts.js` | `/next/savings`, `/next/goals` | Personal/shared meaning explicit; actual deposits only | B/U |
| Investment deposits and trends | `src/investment.js`, `src/investment-model.js` | `/next/investments` | Actual deposits, no inferred returns or balances | B/U |
| Loans and repayment schedules | `src/loans.js` | `/next/loans` | Existing repayment math and forecast effect | B/U |
| Primary report center and stored reports | `src/report-inbox-client.js`, `src/stored-reports-client.js` | `/next/reports` | Destination space/privacy before upload; resume private reports | B/U |
| Report parsers and review/classification | `src/bank-import-client.js`, `src/reports.js`, `tools/bank-csv/` | `/next/reports/review` | Duplicate/partial/undo guards; existing parser outputs | B/U |
| Incoming and outgoing internal transfers | `src/reports.js`, `src/budget.js` | `/next/reports/review`, `/next/monthly` | Separate from salary/consumption; no automatic recurrence | B/U |
| Apple Pay and Shortcut entry | `src/apple-pay-client.js`, `server/app.mjs` | `/next/settings/connections` | Current installation/ingest behavior, no credential disclosure | B/U |
| Gmail connection | `src/gmail-client.js`, `server/app.mjs` | `/next/settings/connections` | Existing OAuth flow and private authorization | B/U |
| Report review/actions center | `src/action-center-client.js`, `server/actions.mjs` | `/next/actions` | User-specific actions and guarded apply | B/U |
| Save status, conflicts, draft recovery | `src/save-dock.js`, `src/drafts.js`, `src/client.js` | shared shell | Explicit save; failure retains edits; conflicts visible | B/U |
| Refresh and browser navigation | `src/client.js`, `src/navigation.js` | shared shell | Unsaved edits protected; failed refresh retains view; back/forward | B/U |
| Plan history and recovery | `src/plan-history-client.js`, `server/plan-history.mjs` | `/next/settings/history` | Revision-aware restore, user/space scoped | B/U |
| JSON export/import and external backup | `src/client.js`, `src/drive-backup-client.js` | `/next/settings/backups` | Existing export/import, Drive settings and private access | B/U |
| Appearance and account colors | `src/theme.js`, `src/wallet-design.js` | `/next/settings/appearance` | System/Light/Dark per device; immediate; separate from budget save | B/U |
| Security and encrypted budget vault | `src/security.js`, `src/vault.js` | `/next/settings/security` | Keys client-side; lock clears plaintext; recovery works | B/U |
| Sharing, invitations and permissions | `src/spaces.js`, `src/spaces-worker.js` | `/next/spaces/manage` | Existing owner/editor/viewer checks; revoked access clears data | B/U |
| Private transfer matching | `src/space-transfers-client.js`, `src/transfer-matching-model.js` | `/next/spaces/transfers` | Current encrypted references and access rechecks | B/U |
| Account migration dependency review | `src/space-migration-client.js` | `/next/spaces/migration-review` | Read-only; no account move/application action | B/R/U |
| Help, administration and account profile | `src/client.js`, `server/app.mjs` | `/next/settings`, `/next/help` | Admin controls role-gated; current account identifiable | B/U |

The handwritten Tazrim display candidate is **not** part of this baseline. It remains a separate prototype and may provide useful edge-case tests, but its UI is not a parity destination.

## Release baseline rule

Before activation, determine the actual running release and compare its features with this baseline. If production contains newer work, rebase or integrate it; do not deploy a build from an older commit. Independently review canonical uncommitted work to decide what belongs to a release. In particular, do not copy or revert the deleted Apple Pay Shortcut without resolving its current owner.

Each row moves from planned to complete only after navigation, real read/write behavior, privacy and draft checks pass. A link to the old interface is a temporary bridge, not completion.

## Read-only presentation progress — 2026-10-27

The development frontend now includes pinned bank/card wallets and category/search/result presentation. `/categories` and `/search` browse cleared detail only, and `/details/:id` shows allowlisted original saved-row fields; no original-file or bank-global search is claimed. Negative refunds, missing data, billing-period scope, selected-space isolation and split-versus-original amounts remain explicit. These are read-only portions of the table's workflows, not completed edit/report/security parity. See `checkpoint.md` for current tests and remaining release gates.

## First write pattern — 2026-10-27

Manual plaintext monthly reporting now has an explicit load/edit/save/reload path with shared navigation/refresh guards, conflicts, uncertain-response recovery and downloadable draft backup. Account/import reconciliation, vault writes and other financial editors remain pending. This does not complete all rows in the inventory. See checkpoint for the restricted eligibility and browser acceptance limits.
