# Budgit to Tazrim frontend: feature inventory

> **Current source audit — 2026-10-30:** The table below now maps the original inventory to actual routes and representative current tests. `C` means connected to the original command/model and covered in bounded contracts; it does not certify complete browser/device/release acceptance. `R` means the original read-only boundary is retained. `A` means acceptance remains open. `U` means current-live reconciliation/release unverified. `X` is explicitly excluded. Keep exact original-interface bridges until equivalent acceptance passes. Detailed evidence: [execution-status.md](execution-status.md). Apple Pay is excluded by Tal.

The earlier inventory used proposed route names and baseline-only statuses. Its evidence remains below, but it is no longer the implementation queue. Actual routing is in `frontend/src/main.tsx` under `/next`; all rows retain actor/space/revision and original financial/source guards. The latest read-only source verification remains2026-10-28 against `a79488b`; a fresh2026-10-30 SSH check timed out without reading data or mutating the server. Do not treat historical verification as fresh release readiness.

| Workflow | Original boundary | Actual React destination | Evidence and remaining boundary | Status |
| --- | --- | --- | --- | --- |
| Sign-in, logout, account identity | server/app.mjs, src/client.js | /next, /next/settings; locked security screen | tazrim-react-hosting, tazrim-session-controls; original POST logout now connected through draft guard; fresh UI acceptance open | C/A/U |
| Demo and onboarding | src/onboarding.js, src/budget.js | /next/start; development-only demo mode | tazrim-onboarding; setup eligibility preserves existing records; production demo route/browser matrix open | C/A/U |
| Space selection, invitations, roles | src/spaces.js, src/spaces-worker.js | shell selector, /next/settings/spaces | tazrim-spaces-management; owner/editor/viewer and revision guards; broader device matrix open | C/A/U |
| Separate space overview | src/space-overview-model.js | /next/overview | tazrim-overview; bounded viewer/locked/revoked/failed-refresh browser evidence; no combined balance | C/R/A/U |
| Status, forecast and charts | src/budget.js, src/status-model.js | /next, /next/plans/scenario | tazrim-react-adapter, tazrim-analysis; original sums and actual-only meaning; complete chart/device comparison open | C/A/U |
| Monthly totals and account monthly corrections | src/cash-accounts.js, src/budget.js | /next/monthly, /next/accounts/:id/monthly[/correction] | tazrim-monthly-report/save/recovery, tazrim-cash-monthly; original source/revision guards | C/A/U |
| Bank account metadata and setup | src/cash-accounts.js, src/budget.js | /next/banks/:id, /next/accounts/new, /next/accounts/:id/edit | tazrim-account-command; manual/imported metadata connected; bank deletion not an original capability | C/A/U |
| Card metadata, payer, totals, no activity, estimate retirement | src/cards.js, src/card-billing-client.js | /next/card-setup, /next/cards/:id/{payer,billing,no-activity,stop} | tazrim-card-config/payer/stop, tazrim-billing-correction; reports/details retained | C/A/U |
| Categories, limits, merchant views and source detail | src/details.js, src/merchant-categories.js | /next/categories[/manage,/limits], /next/search, /next/details/:id[/annotate] | tazrim-category-management/limits, tazrim-react-details, tazrim-analysis; split/original amounts distinct | C/A/U |
| Cheques and optional manual detail | src/details.js, src/budget.js | /next/details/manage, /next/details/{new,:id/edit,:id/delete,:id/clear} | tazrim-detail-management; included/additional/cancelled/cleared semantics and bounded browser coverage | C/A/U |
| Planned purchases, expected income, installments and trials | src/planner.js, src/budget.js | /next/plans, /next/plans/scenario | tazrim-planned-item/removal, tazrim-scenario-command/save; original plan math and explicit save | C/A/U |
| Savings balances, goals, deposits, allocations and estimated growth | src/savings.js, src/savings-accounts.js, src/budget.js | /next/savings, /next/savings/{accounts,allocation,returns,:id/deposit,:id/remove} | tazrim-savings-balance/deposit/goal/returns; personal/shared contributions remain explicit | C/A/U |
| Savings requests, transfers and schedules | src/savings.js, src/budget.js | /next/savings/{transfer,transfers,schedule} | tazrim-savings-transfer/schedule; original request lifecycle, not bank transfers; bounded browser evidence | C/A/U |
| Investment deposits and simulation | src/investment-model.js | /next/investment | tazrim-investment; original recorded deposits/history/projection and explicit goal save | C/A/U |
| Loans and repayment lifecycle | src/loans.js, src/budget.js | /next/loans, /next/loans/:id/{edit,remove} | tazrim-loan-command; canonical selected-loan payer fix preserved | C/A/U |
| Reports, original parsers, review and grouping | src/report-inbox-controller.js, src/report-inbox-model.js, tools/bank-csv, server/report-store.mjs | /next/upload, /next/upload/:id/review, /next/upload/{group,:id/group} | report-inbox-controller, tazrim-card-report-review/bank-report-review/encrypted-reports; optional categories and version1 group progress; bounded synthetic browser evidence | C/A/U |
| Source lifecycle, saved progress and bank undo | src/stored-reports-client.js, src/bank-import-model.js | /next/upload/:id/{state,delete}, /next/upload/history/:id/undo | tazrim-report-library/history-undo and original source service tests; atomic source group pruning retained | C/A/U |
| Cash assignments and internal transfers | src/cash-accounts.js, src/budget.js | /next/accounts/{assignments,transfers,:id/assign-remainder} | tazrim-cash-assignments/flow; original remainder and transfer actions, no double counting | C/A/U |
| Consumption, partial allocation, matching, family and periodic costs | src/source-allocation-ui.js, src/budget.js, src/reconciliation-model.js | /next/analysis | tazrim-consumption/family-review/periodic/coverage; bounded desktop/phone/viewer and same-action recovery evidence | C/A/U |
| Insight assumptions, anomalies, period review and saved views | src/insight-ui-model.js, src/budget.js | /next/analysis | tazrim-insight-controls/analysis; original actual-only baseline and stale-evidence guards | C/A/U |
| Gmail filters, notices and optional scan | src/gmail-ui-model.js, server/gmail.mjs | /next/settings/gmail, /next/settings/gmail/notices/:id | tazrim-gmail-settings/notices; bounded synthetic browser acceptance; actual Google OAuth/phone unverified | C/A/U |
| Apple Pay and Shortcuts | existing Wallet implementation retained | /next/settings/wallet retained as existing code | Explicitly excluded2026-10-29; no further development/acceptance gate | X |
| Report reminders, optional integration facts, global action dialog | src/action-center-model.js, server/actions.mjs | /next/actions, shared global dialog | tazrim-action-center/integrations/global-save-evidence; personal CAS reminders and memory-only scoped failed-save evidence | C/A/U |
| Draft guards, conflict/save status, refresh and navigation | src/drafts.js, native shared save/guard adapters | shared shell and financial editors | tazrim-draft-registry/monthly-save/pull-refresh; bounded browser evidence; full route/back-forward/touch matrix open | C/A/U |
| Original device draft inspection and recovery | src/device-drafts.js, native device draft adapter | /next/settings/device-draft | tazrim-device-draft/settings-summary/monthly-device-persistence; exact scoped draft and prior bounded browser evidence; fresh settings summary/device matrix open | C/A/U |
| History, saved-budget JSON export/import and latest undo | src/plan-history-client.js, server/plan-history.mjs, src/vault.js | /next/settings/history, /next/settings/security | tazrim-history/history-undo/vault; plaintext/encrypted scope guards; complete download/device matrix open | C/A/U |
| Drive encrypted server backup | src/drive-backup-model.js, server/drive-backup.mjs | /next/settings/drive; original Google connection bridge | tazrim-drive-backup/view; bounded browser schedule/run/disconnect/nonadmin; exact service archive/hash/header check; browser download/new copy/state fixes still require acceptance | C/A/U |
| Appearance and original display options | src/theme.js, native appearance and analysis views | /next/settings, /next/analysis; exact original appearance bridge | released theme retained; bounded320/390/430/768/1440 analysis and Light/Dark/System checks; full OS flip/reduced-motion/wallet settings parity open | C/A/U |
| Security, vault, device unlock and report inbox consent | src/security.js, src/vault.js, shared PRF helpers | /next/settings/security; locked-route guard | tazrim-vault/device-draft/encrypted-reports; original encryption and ciphertext retry; real platform PRF/Face ID unverified | C/A/U |
| Private encrypted inter-space matching | src/transfer-match-commands.js, src/transfer-matching-model.js | /next/overview/transfers | tazrim-transfer-matches; original encrypted references, owner/private visibility, source guards and bounded browser evidence | C/A/U |
| Account migration review, manual/imported/savings execution and undo | src/migration-controller.js, src/space-savings-migration.js, original paired service | /next/overview/migration | tazrim-native-migration/migration-*-manifest; bounded imported/savings desktop/390px lost apply/undo privacy evidence; larger pagination open | C/A/U |
| Forecast defaults, monthly goals, profile and Help | src/budget.js, original form commands | /next/settings/{forecast,profile}, /next/goals, /next/about | tazrim-forecast-settings/comparison-goals/profile; native Hebrew Help; broader device acceptance open | C/A/U |
| Administrator login access | server/app.mjs | /next/settings/access | tazrim-admin-access; original global allow-list CAS and additive actor guard; bounded synthetic browser/nonadmin evidence | C/A/U |
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
