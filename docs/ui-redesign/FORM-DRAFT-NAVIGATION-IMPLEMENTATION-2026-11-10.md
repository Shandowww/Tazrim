# Form-draft navigation implementation — 2026-11-10

Execution started from `40ad892` on `codex/budgit-household-ui`. Current live evidence identifies application `a556d9c`. Publication is verified below; device acceptance limits remain explicit.

## Recovery contract

`src/form-drafts.js` uses a separate `form-draft:v1:` namespace in the existing IndexedDB store. Full actor/budget/kind/record/period/context scope is authenticated by the original AES-GCM primitives. Legacy `draft:` keys are untouched. Raw partial fields and small comparison baselines are stored; financial Save remains explicit. Source bytes, parsed rows, derived plans, secrets and commit confirmations are excluded. Group choices use the original report serializer and the existing source loader/proofs.

Stored revisions and baselines must match before automatic restoration. Incompatible copies stay separately available for review/export/discard in Settings → device drafts. No automatic rebase, import or mutation retry occurs. New records use a stable `new` draft identity; actual creation retains the existing generated record ID and save command. Cleanup compares the exact writer generation and stored witness; newer edits or another tab are retained.

Route navigation flushes dirty recoverable editors and waits for committed storage. Rapid attempts retain the first pending action. App refresh and interface switching explicitly opt into this behavior. Other `guard.run` operations, logout and vault lock retain their existing protection. Browser exit checks current durability synchronously; newest uncommitted keystrokes can still be lost on OS termination. No offline support is claimed.

## Guard coverage

Each row identifies an actual registration; raw values and semantic scope are shown below. All adapters use the saved editor baseline and base revision, with source/settings revisions in the baseline where applicable. Their dependencies and explicit commands remain in the referenced editor; they are not replaced by a financial engine.

| Editor / registration | Disposition | Raw editable state / exception |
| --- | --- | --- |
| [account-page.tsx:20](../../frontend/src/app/account-page.tsx) | raw device draft | draft |
| [action-center-page.tsx:21](../../frontend/src/app/action-center-page.tsx) | guard exception | Unresolved preference mutation only; original same-operation retry retained. |
| [admin-access-page.tsx:17](../../frontend/src/app/admin-access-page.tsx) | raw device draft | email |
| [analysis-mutations.tsx:15](../../frontend/src/app/analysis-mutations.tsx) | raw device draft | name |
| [bank-report-review.tsx:22](../../frontend/src/app/bank-report-review.tsx) | raw device draft | selection |
| [billing-page.tsx:19](../../frontend/src/app/billing-page.tsx) | raw device draft | {...draft,confirmed:false} |
| [card-activity-review.tsx:10](../../frontend/src/app/card-activity-review.tsx) | raw device draft | {cycle,total} |
| [card-page.tsx:25](../../frontend/src/app/card-page.tsx) | raw device draft | draft |
| [card-payer-page.tsx:19](../../frontend/src/app/card-payer-page.tsx) | raw device draft | payer |
| [card-report-page.tsx:34](../../frontend/src/app/card-report-page.tsx) | raw device draft | selection |
| [card-stop-page.tsx:17](../../frontend/src/app/card-stop-page.tsx) | guard exception | Destructive estimate-removal approval; saved reports and original financial command retained. |
| [cash-assignments-page.tsx:16](../../frontend/src/app/cash-assignments-page.tsx) | raw device draft | {...draft,confirmed:false} |
| [cash-flow-page.tsx:21](../../frontend/src/app/cash-flow-page.tsx) | raw device draft | {...draft,confirmed:false} |
| [cash-monthly-page.tsx:19](../../frontend/src/app/cash-monthly-page.tsx) | raw device draft | draft |
| [category-limit-page.tsx:18](../../frontend/src/app/category-limit-page.tsx) | raw device draft | {...draft,confirmed:false} |
| [category-management-page.tsx:20](../../frontend/src/app/category-management-page.tsx) | raw device draft | draft |
| [comparison-goals-page.tsx:19](../../frontend/src/app/comparison-goals-page.tsx) | raw device draft | draft |
| [consumption-mutations.tsx:23](../../frontend/src/app/consumption-mutations.tsx) | raw device draft | {editor,from,to,query,applied,replaceFilter,amounts} |
| [detail-annotation-page.tsx:17](../../frontend/src/app/detail-annotation-page.tsx) | raw device draft | draft |
| [detail-management-page.tsx:23](../../frontend/src/app/detail-management-page.tsx) | raw device draft | {draft,payer} |
| [device-draft-page.tsx:20](../../frontend/src/app/device-draft-page.tsx) | guard exception | Legacy complete-plan recovery approval and unknown save result; existing draft format and recovery command remain unchanged. |
| [drive-backup-page.tsx:17](../../frontend/src/app/drive-backup-page.tsx) | raw device draft | mode |
| [forecast-settings-page.tsx:17](../../frontend/src/app/forecast-settings-page.tsx) | raw device draft | draft |
| [gmail-page.tsx:21](../../frontend/src/app/gmail-page.tsx) | guard exception | An attempted notification-state mutation only; same-operation retry remains guarded. |
| [gmail-settings-editor.tsx:16](../../frontend/src/app/gmail-settings-editor.tsx) | raw device draft | draft |
| [history-page.tsx:12](../../frontend/src/app/history-page.tsx) | guard exception | Active export only; no ordinary editable values. |
| [history-review.tsx:11](../../frontend/src/app/history-review.tsx) | guard exception | Undo confirmation for a historical financial snapshot; requires a fresh review and approval. |
| [incoming-reports-page.tsx:46](../../frontend/src/app/incoming-reports-page.tsx) | guard exception | File reselection, server-read consent, routing review with source proof, connection secrets and deletion confirmation. Existing source/progress machinery retained. |
| [insight-controls.tsx:13](../../frontend/src/app/insight-controls.tsx) | raw device draft | draft |
| [investment-page.tsx:25](../../frontend/src/app/investment-page.tsx) | raw device draft | {draft,monthlyTouched,goalSelected} |
| [loan-payments-page.tsx:25](../../frontend/src/app/loan-payments-page.tsx) | guard exception | Movement reassignment/future-rule confirmation or original-file metadata recovery proof. Prepared plans/proofs are not serialized; query-only browsing has no guard. |
| [loans-page.tsx:24](../../frontend/src/app/loans-page.tsx) | raw device draft | draft |
| [loans-page.tsx:32](../../frontend/src/app/loans-page.tsx) | guard exception | Removal confirmation (second editor); the loan create/edit editor uses scoped raw drafts. |
| [migration-page.tsx:25](../../frontend/src/app/migration-page.tsx) | guard exception | Multi-space migration depends on temporary vault keys, freshly loaded source/target proofs and prepared atomic operations. Existing recovery/uncertainty guard retained. |
| [monthly-page.tsx:38](../../frontend/src/app/monthly-page.tsx) | raw device draft | draft |
| [onboarding-page.tsx:19](../../frontend/src/app/onboarding-page.tsx) | raw device draft | {v,step} |
| [periodic-controls.tsx:12](../../frontend/src/app/periodic-controls.tsx) | raw device draft | {edit,link} |
| [planned-items-page.tsx:24](../../frontend/src/app/planned-items-page.tsx) | raw device draft | draft |
| [planned-items-page.tsx:33](../../frontend/src/app/planned-items-page.tsx) | guard exception | Removal confirmation (second editor); planned-item create/edit uses scoped raw drafts. |
| [profile-page.tsx:17](../../frontend/src/app/profile-page.tsx) | raw device draft | name |
| [recurring-page.tsx:16](../../frontend/src/app/recurring-page.tsx) | raw device draft | choices |
| [report-automation-panel.tsx:18](../../frontend/src/app/report-automation-panel.tsx) | guard exception | Automation activation/server-read consent or rejection approval; fresh confirmation required. |
| [report-expectations-page.tsx:17](../../frontend/src/app/report-expectations-page.tsx) | raw device draft | draft |
| [report-group-page.tsx:198](../../frontend/src/app/report-group-page.tsx) | raw device draft | See typed adapter |
| [report-history-page.tsx:18](../../frontend/src/app/report-history-page.tsx) | guard exception | Import undo approval with source/revision evidence; must be reviewed again. |
| [report-library-page.tsx:26](../../frontend/src/app/report-library-page.tsx) | guard exception | Selected File bytes are not persisted. Reselect the file after leaving; explicit upload consent remains fresh. |
| [report-state-page.tsx:15](../../frontend/src/app/report-state-page.tsx) | raw device draft | reason |
| [report-storage-consent.tsx:9](../../frontend/src/app/report-storage-consent.tsx) | guard exception | Consent to server-readable source storage; never reusable authorization. |
| [savings-balance-page.tsx:23](../../frontend/src/app/savings-balance-page.tsx) | raw device draft | {accounts,allocation,date,modes,deposit} |
| [savings-goals-page.tsx:25](../../frontend/src/app/savings-goals-page.tsx) | raw device draft | draft |
| [savings-schedule-page.tsx:16](../../frontend/src/app/savings-schedule-page.tsx) | raw device draft | draft |
| [savings-transfer-page.tsx:20](../../frontend/src/app/savings-transfer-page.tsx) | raw device draft | {...draft,confirmed:false} |
| [scenario-page.tsx:26](../../frontend/src/app/scenario-page.tsx) | raw device draft | rows |
| [security-page.tsx:23](../../frontend/src/app/security-page.tsx) | guard exception | Passwords, recovery secrets, vault setup keys and selected encrypted files; never automatically persisted. |
| [spaces-page.tsx:18](../../frontend/src/app/spaces-page.tsx) | raw device draft | {createName,rename,inviteEmail,inviteRole} |
| [statement-notices-page.tsx:16](../../frontend/src/app/statement-notices-page.tsx) | guard exception | Active notice fetch/update only; no ordinary draft. |
| [transfer-matches-page.tsx:18](../../frontend/src/app/transfer-matches-page.tsx) | guard exception | Temporary source-vault secrets and private transfer proof/approval; cannot restore without reopening and revalidating sources. |
| [wallet-page.tsx:26](../../frontend/src/app/wallet-page.tsx) | guard exception | Retired Apple Pay scope includes connection secrets, imported files and pending mutation envelopes; retains its original guard. |

## Conditional exceptions inside connected editors

Destructive removal/clear modes, prepared source-allocation or analysis mutation confirmations, privileged access commands, join tokens, OAuth/backup approvals, active server writes and unknown results retain protection. Ordinary raw fields in those components are persisted where separable. Files require reselection; source-bound report choices reopen through the existing source library.

## Verification and release status

Final local source passes build/typecheck, 1,437 regressions (including bank/card readers), 15 core checks and 69 synthetic browser checks. The browser run covers whitespace-only edits without changing Save enablement, immediate pre-debounce navigation, first-destination capture, exact partial strings, independent forms and reporting periods, reload, Back/Forward, guarded full refresh, grouped-source choices without progress upload, 320px dark/reduced-motion keyboard use, 390px overflow checks, scoped discovery/export/discard, competing tabs, storage denial/retry, viewer and actor isolation, and one-write lost-response creation recovery. Navigation/reload checks preserve all synthetic financial data; the separate explicit creation performs one synthetic financial write and its retry performs none.

Sixteen focused behavior contracts additionally cover the actual transactional namespace/CAS implementation, encryption/full-scope binding, changed keys, stale revisions, pending-generation flushing, failure/retry, cleanup/discard races, vault epoch/unmount guards, newer edits during a save and original grouped-report serialization. Legacy drafts and original commands remain covered by the existing regression suite.

Evidence: `evidence/form-draft-browser-2026-11-10.json` and `evidence/form-draft-inventory-2026-11-10.json`. Browser coverage is bounded, not an exhaustive visual run of every editor or a physical-iPhone/PWA/PRF/Face ID test. No new offline support or guaranteed recovery after OS termination is claimed.

The live application was reconciled read-only as `a556d9c90736a77c6e3d1551e62ca7e4e632d66f`, image `sha256:3982d45e544936115adfcaee9a8c245514e90ad24d06c59d3b04725ca98acbd9`. Application `70a302af58d8d9165c8f3c83a3ec4fe0f0377496` is now verified live. Fresh verified backup, isolated release/rollback gates, 208 built-candidate contracts and all 172 runtime hashes passed. All 50 authoritative tables, configuration/keys and adjacent services were preserved. Evidence: `docs/ui-redesign/evidence/release-form-drafts-2026-11-10.json`. No production record edits, Sites or resources changed.
