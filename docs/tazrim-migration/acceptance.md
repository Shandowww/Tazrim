# Development acceptance — 2026-10-27

> **Active scope correction — 2026-10-28:** Tal instructed us to connect existing Budgit features, not rewrite them. [completion-plan.md](completion-plan.md) supersedes historical pending/next-action lists below. They remain evidence only. Classify missing React behavior as connection work; retain original workflow semantics and completed tested work. Source inspection found optional-category parity, grouped draft/orchestration and generic bridge gaps; they are not fixed by this documentation update. Production is unchanged.

**Incomplete preview; not released.** Tested application checkpoint: `264953ff97095a44b36fbde9c3e72a153707d35f` plus the subsequent planned-item-removal stage recorded in the checkpoint. Canonical backend baseline: `eb507d9`, with isolated loan-removal fix `04eb8c0`. Tests use synthetic identities and in-memory databases only. No live records, production service or Sites changed.

## Verification

- `node build.mjs`: passed frontend TypeScript/Vite plus backend/model packaging.
- `node verify.mjs`: 15 checks passed.
- `node --test test/*.test.mjs`: 780 passed, zero failed/skipped.
- GitHub frontend checkpoint and fork export preserve separate source histories. Exact fork provenance lives in `fork-sync.json`; reconciliation inventory lives in `backend-reconciliation.json`.

## Scoped browser evidence

| Workflow | Observed result | Local screenshot |
| --- | --- | --- |
| Manual account monthly reporting | Explicit account totals and signed/unknown balances; reload; lost receipt retry; other account/user unchanged; viewer refused | `work/react-account-monthly-recovered.jpg` |
| Planned items | Phone installment rounding/fees, expected income, explicit payer; saved edit URL; immediate light appearance | `work/react-planned-installments-phone.jpg`, `work/react-planned-items-phone-light.jpg` |
| Loans | Create/reload and confirmed removal; dirty guard; lost receipt retry without duplicate write; viewer refused | `work/react-loan-removal-recovered.jpg` |
| Savings-goal metadata | Changed target/funding intent and created zero-allocation goal without changing total/free/allocated balances; saved edit reload; viewer refused | `work/react-savings-goals-phone.jpg` |
| Journal/export | Two-page history, same-scope failed-refresh retention, account-change clearing, no writes; export dispatch notice | `work/react-history-phone.jpg` |
| Recurring evidence | Confirm, dirty navigation/stay, uncertain receipt and explicit retry without duplicate write; shared viewer read-only | `work/react-recurring-phone.jpg` |

Phone checks used a disposable local 390×844 same-origin iframe wrapper. Its content measured 375px with a scrollbar and no horizontal overflow. Production frame protections were unchanged. This does not count as real iPhone or complete viewport acceptance. Browser viewport screenshot overrides were unreliable and were reset. Screenshots/logs/harnesses remain ignored local artifacts, not fork assets.

One unlocated MutationObserver error appeared in goal/recurring iframe QA during native-dialog interactions. Fresh ordinary-page goal QA and recurring dirty-dialog/stay QA had no captured errors; recurring choice and disabled clean-save state were preserved. The iframe issue's source remains unproven. The journal iframe download waiter timed out after dispatch; the downloaded file's browser completion remains unverified. API tests independently validate exact backup round-trip, authorization and absence of writes.

## Explicitly incomplete

Report upload/parser/review/classification/duplicate/apply/undo/resume; source-backed monthly/account/import editing; account/card lifecycle/payer changes; calculator/scenarios; savings assets/balance/deposits/rates/allocations/removal; space membership/invitations/transfers/migration UI; vault/security/recovery and snapshot preview/undo; remaining settings/help and inventory parity. Existing-interface links remain temporary bridges.

Full 320/390/430/768/1440 comparison, long-label/empty/loading/error matrix, light/dark/System/reduced-motion/keyboard, actual iPhone and complete cross-workflow navigation/download acceptance remain open. Reconcile the actual running release and unrelated canonical work before constructing a candidate. Release requires verified fresh SQLite backup, isolated financial/access/HTTP preflight, rollback source/image, exact Git backup, runtime hash/health/deep-route/unauthenticated verification and unchanged parking service. No release readiness claim is made.

Planned-item removal follow-up: desktop ordinary-page confirmation, dirty-navigation/stay, lost receipt/retry/list return and shared viewer restriction passed; one write only, other private/shared revisions unchanged, no captured errors. Screenshot: `work/react-item-removal-recovered.jpg`. Four additional tests bring the suite to 780. Removal preserves saved reports/details and explains its effect on past forecasts; loan/item uncertain-save status wording is now accurate.


## Current application checkpoint — 771a931 — 2026-10-27

This update supersedes the older pending scope only for the completed slices below. Build/typecheck,810 regression tests and15 checks pass. Added scenario editing/comparison/apply, savings balance setup/update/allocation/removal/pace/estimated growth, owner space creation/join/invite/permission/revocation and plaintext snapshot review/latest undo. Each uses existing models and explicit actor/access/revision or management preconditions; financial records remain private and forecasts remain estimates.

Synthetic browser evidence: `work/react-scenario-phone.jpg`, `work/react-savings-balance-recovered.jpg`, `work/react-spaces-management.jpg`, `work/react-history-undo-recovered.jpg`, `work/react-savings-returns.jpg`. Checks include uncertain receipt recovery/no duplicate financial writes, explicit management recipient/role confirmation, management uncertain-write lock, unchanged other-user/shared revisions, refused over-allocation and preserved last growth estimate on rate-refresh failure. Exact stage-level tests, limits and audit counts are in `checkpoint.md`.

Still incomplete: source-aware report intake/parsing/review/apply/undo/resume; imported account/card and remaining lifecycle/report editing; savings deposit/new-transfer/schedule workflows; vault/unlock/recovery/encrypted import/export; private transfer matching/account and savings migrations/overview; other inventory settings/help and complete reference-visual/device acceptance. The source adds account binding/conditional name-role checks in `src/spaces-worker.js` and undo binding in `server/plan-history.mjs`; those frontend-branch backend changes are not live. The earlier canonical reconciliation baseline remains explicit, and actual running release/unrelated canonical changes must be reconciled before release. No production/Sites/real-record change or release-readiness claim.
