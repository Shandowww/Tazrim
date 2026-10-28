# Budgit to Tazrim frontend: feature inventory

> **Execution status — 2026-10-28:** [execution-status.md](execution-status.md) records the verified production baseline, current per-workflow connections and actual completion limits. Shared original report orchestration/drafts and optional categories are now implemented. Historical pending lists below are not a feature-development queue.

> **Active scope correction — 2026-10-28:** Tal instructed us to connect existing Budgit features, not rewrite them. [completion-plan.md](completion-plan.md) supersedes historical pending/next-action lists below. They remain evidence only. Classify missing React behavior as connection work; retain original workflow semantics and completed tested work. Source inspection found optional-category parity, grouped draft/orchestration and generic bridge gaps; they are not fixed by this documentation update. Production is unchanged.

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

## Manual bank account setup slice — 2026-10-27

Manual account name/color/buffer/optional opening balance now has a guarded explicit write route. Existing aggregate money and payer identities remain unchanged; source/import account editing, card setup, deletion and account monthly reconciliation remain pending. New UI browser acceptance is blocked by Work settings and is not claimed.

## Card setup slice — 2026-10-27

Configured/discontinued card listing and name/alias/billing-day create/edit are implemented with real draft/save protection. Explicit payer selection is supported only for a new zero-total card. Existing payer changes, closure/reactivation, card reports/import reconciliation and browser acceptance remain pending.

## Current write scope — 2026-10-27

The committed canonical backend is reconciled through `eb507d9`; both test families run together. Manual account monthly reports now have their own scoped editor and use original reconciliation/cent arithmetic. Planned items now have list/create/edit and exact installment preview with expected income distinguished from actual receipts. Account/card creation and saved edit routing, draft-file recovery, guarded navigation and role/identity refusals have scoped browser evidence. Imported/source-backed report reconciliation, full scenarios/calculator/removal, loan/savings/goals/report/security/settings/space UI and final release acceptance are still open. See checkpoint for exact restrictions and validation rather than treating the earlier inventory status as current completion.

## Current bounded workflow coverage — 2026-10-27

Loan lifecycle, savings-goal metadata, recurring evidence decisions and scoped journal/plaintext saved-budget export are now implemented in the React preview. Their financial ledgers remain governed by the existing models and shared actor/revision save boundary. This supersedes the corresponding older pending notes only for these slices. Savings assets/deposits/allocations, source-aware reports, scenarios/removal, space/security management and full release acceptance remain incomplete. See `acceptance.md` and the detailed checkpoint for exact tests, browser evidence and remaining limitations.

Planned-item removal is now implemented with explicit confirmation, pre-removal backup, preserved reports/details and guarded acknowledgment/retry. This supersedes its older pending status; calculator/scenarios and the other release limits remain open.

Current application checkpoint771a931 includes guarded scenario UI/apply, savings balances/allocation/removal/pace/estimated growth, owner private/shared-space management and plaintext snapshot review/latest undo. Remaining imported-source, deposit/transfer, vault/migration/device/release scope is enumerated in the current acceptance addendum. Earlier pending entries for these completed slices are historical.

## Report review update — 2026-10-27

Native source library/inspection and bounded single-source card review/classification/manual duplicate decisions/progress resume/atomic apply are implemented, using original parsers and financial/receipt models. Lost successful commits recover without replay; source/actor/financial revision guards remain mandatory. Bank/mixed/multiple-sheet/activity/multi-file groups and advanced saved groups still use the existing interface. Report undo and remaining management and complete document/mobile acceptance remain pending. See checkpoint.md;831 tests and15 checks passed. No deployment readiness claim.

Report management follow-up: reversible source archive/reactivation now has explicit confirmation, revision/account guards and uncertain-result recovery. Source and progress are retained; committed-source undo, verified-backup cleanup/delete and advanced group workflows remain pending.835 regressions and15 checks passed.

## Native bank import integration — 2026-10-28

Single unambiguous plaintext bank statements now support native review, saved progress/resume, explicit confirmation, budget backup and atomic plan/source import, including uncertain-response recovery without replay.848 regressions/build/15 checks and scoped desktop/390px browser acceptance pass. Advanced/mixed/activity/group workflows and full document/device/release acceptance remain pending; production unchanged. See checkpoint.md for exact boundaries.

Native Cal activity follow-up — 2026-10-28: explicit source cycle/final-total/acknowledgment selection, saved progress/resume and original derived-cycle receipt atomic import are implemented. Unsupported installments and sheet-total substitution fail closed; server capability/proof validation and rollback are covered.856 tests/build/15 checks and scoped CSV/390px browser checks pass. Single stored source commits one cycle; further monthly bills/advanced groups/document/iPhone/release acceptance remain bounded as documented in checkpoint.md. Production unchanged.
