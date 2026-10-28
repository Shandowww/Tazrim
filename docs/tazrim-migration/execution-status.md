# Completion execution — 2026-10-28

The active scope is [completion-plan.md](completion-plan.md): connect existing Budgit workflows. This status replaces older pending lists as the current connection inventory. A working bridge retains access while a React screen is unfinished; it does not certify full frontend parity.

## Verified production baseline

Read-only SSH inspection after Tal unlocked the existing key verified `/opt/budgit/RELEASE` = `a79488ba465e6061edeb542aa22e40b852489631`. All **141** tracked application/source/public/build/package files selected from that commit matched the deployed source by SHA256. No database, budget, report, credential or environment-file contents were read. Runtime HTML SHA256 is `4e9560e7558657ad17eb67c2442a9ffe4fb53a17a03cc89c5a5308c97d795a9a`, matching the recorded release evidence. Budgit image is `sha256:aaf3aa6ea3ee287f86e398ff80f62405113e665d941234f3a1deb31b57652aa3`; runtime Node is v24.22.1. The existing parking proxy image was observed as `sha256:ef6c497a6a93005d5d0c30ecba2e12a9514118e02c368137f3307e07e14b8bab`. Inspection occurred at approximately 2026-10-28 08:10 UTC; it did not deploy or alter any service.

This resolves the previously unknown live source. The committed canonical private/shared baseline `eb507d9` and loan fix `04eb8c0` were already incorporated into the frontend branch. Those newer capabilities must still be distinguished from the older production release. Independently modified canonical files remain excluded.

The comparison also found a concrete downgrade risk: the frontend baseline lacked production's original-interface Tazrim theme/device choice. The exact released `src/theme.js`, `src/tazrim-theme.css`, third-party notice and theme regression cases have been carried into this development branch; only the corresponding original settings/build hooks were connected. React keeps its own existing presentation. No handwritten display prototype or unrelated canonical theme/Shortcut work was copied.

## Existing workflows and current connections

C = a bounded React connection with existing acceptance evidence; P = existing behavior needing remaining React connection/acceptance; R = existing restriction to preserve. C/P means a completed slice with identified remaining actions. Evidence names below are in `test/`; prior browser evidence and its limits remain in `checkpoint.md` and `acceptance.md`.

| Existing workflow | Current React destination / retained access | Current status and remaining connection | Existing evidence |
| --- | --- | --- | --- |
| Sign-in, logout, identity | `/next/`, existing authenticated server routes | C/P: server auth and actor-bound loading exist; final live/session-expiry/logout acceptance remains | `tazrim-react-budget-load.test.mjs`, `standalone-auth.test.mjs` |
| Demo/onboarding | development fixture; original setup retained | P: fixture navigation exists; original guided first-budget flow still needs React connection | `onboarding.test.mjs`, `tazrim-react-adapter.test.mjs` |
| Space selection, roles | header; `/settings/spaces` | C: scoped switch and owner management implemented; final live/device acceptance remains | original model/client regression suite |
| Combined overview | Settings → existing overview action | P/R: connect the existing overview to React; preserve separate balances, dates and locked-data restrictions | `space-overview.test.mjs` |
| Status and charts | dashboard, bank/card/category screens | C/P: bounded reads implemented; final reference/device/chart acceptance remains | `tazrim-react-adapter.test.mjs`, `tazrim-react-details.test.mjs` |
| Monthly totals | `/monthly`, account monthly editor | C/P: plaintext/manual paths implemented; connect original imported/source-aware corrections | `tazrim-monthly-report.test.mjs`, `tazrim-cash-monthly.test.mjs` |
| Bank setup/balances | `/banks`, account editor; existing accounts section | C/P: manual setup/read implemented; remaining imported-account edits/deletion follow original actions | `tazrim-account-command.test.mjs` |
| Cards/billing/report rows | `/cards`, `/card-setup`; original accounts/report-history sections | C/P: metadata/new payer and reads implemented; remaining existing payer/lifecycle/source edits need connection | `tazrim-card-config.test.mjs`, `card-statement.test.mjs` |
| Categories, caps, source detail | `/categories`, `/search`, `/details/:id`; existing detail editor | C/P: scoped reads implemented; original annotations/caps editing still needs React connection | `tazrim-react-details.test.mjs`, `expense-annotations.test.mjs` |
| Cheques | Settings → original detail/cheque editor | P: connect existing editor; preserve included/separate/cancelled semantics | `details.test.mjs` |
| Planned items/installments | `/plans` and editors | C: bounded create/edit/removal connected; original calculation stays authoritative | `tazrim-planned-item.test.mjs`, `tazrim-planned-removal.test.mjs` |
| Calculator/scenarios | `/plans/scenario` | C: scenario/apply connection implemented; full device/reference acceptance remains | `tazrim-scenario-command.test.mjs`, `tazrim-scenario-save.test.mjs` |
| Forecast/buffer | dashboard/account charts; original forecast | C/P: existing forecast read adapters; remaining original drill-down/navigation must be checked | `tazrim-react-adapter.test.mjs`, `../verify.mjs` |
| Savings/goals | `/savings` and goal/balance/allocation/deposit editors; existing savings action | C/P: tested bounded editors retained; connect original goal transfers/completion/schedules | `tazrim-savings-balance.test.mjs`, `tazrim-savings-deposit.test.mjs` |
| Investment deposits/trends | original monthly/settings/chart actions retained | P: finish React connection to the existing investment screen/model | `investment.test.mjs` |
| Loans | `/loans` and editors | C: existing lifecycle/calculation connected | `tazrim-loan-command.test.mjs` |
| Report center/library | `/upload`, source review/state; exact original report action | C/P: source storage/inspection and bounded review connected; grouped/mixed review is now connected through original handlers; browser/device acceptance and remaining source-management paths remain | `tazrim-report-library.test.mjs`, `stored-reports-client.test.mjs` |
| Parser/review/resume/apply/undo | `/upload/:id/review`; exact saved-source bridge; original report history | C/P: original orchestration and draft serializer now shared by both interfaces; grouped selection/resume now connects the original handlers and version1 drafts; source-aware edit/undo and full acceptance remain | `report-inbox.test.mjs`, `simple-report-flow.test.mjs`, `tazrim-card-report-review.test.mjs` |
| Internal transfers | native bank review; original monthly corrections | C/P: original classifications preserved; remaining correction UI uses existing models | `incoming-transfers.test.mjs`, `outgoing-transfers.test.mjs` |
| Apple Pay/Shortcuts | Settings → existing Connections | P: connect existing settings/help/install behavior; no new bank provider or ingestion service | `apple-pay.test.mjs` |
| Gmail | Settings → existing Connections → Gmail | P: connect existing settings/OAuth UI; no live reconnect for tests | `gmail-import.test.mjs` |
| Action center | existing report/actions interface | P: connect existing action/review UI | `action-center.test.mjs` |
| Save/conflict/draft recovery | shared React draft/save boundary and existing recovery | C/P: plaintext paths connected; encrypted recovery belongs to original vault connection | `tazrim-monthly-save.test.mjs`, `tazrim-monthly-recovery.test.mjs` |
| Refresh/back/navigation | shared guard; scoped original-interface destinations | C/P: model/VM coverage includes retained drafts, exact report destination and viewer refusal; new bridge browser acceptance remains | `interface-destination.test.mjs`, `refresh.test.mjs`, `tazrim-pull-refresh.test.mjs` |
| History/recovery | `/settings/history`; existing privacy/history UI | C/P: plaintext snapshot review/latest undo connected; complete original encrypted history/recovery connection | `tazrim-history.test.mjs`, `tazrim-history-undo.test.mjs` |
| Export/import/Drive backup | scoped plaintext export; Settings → existing Privacy/Connections | C/P: original encrypted import/export/recovery/Drive UI remains to connect | `vault.test.mjs`, `drive-backup.test.mjs` |
| Appearance/account colors | native settings/account editors; retained original theme selection | C/P: current production theme reconciled; final phone/keyboard/contrast/reference acceptance remains | `theme-colors.test.mjs`, `tazrim-account-command.test.mjs` |
| Vault/encryption | existing Privacy/locked-budget interface | P/R: connect existing lifecycle; retain browser-only keys and clear-on-lock/revocation | `vault.test.mjs`, `security-client.test.mjs` |
| Invitations/membership | `/settings/spaces` | C: bounded management connected; final live/device acceptance remains | `tazrim-spaces-management.test.mjs` |
| Private transfer matching | existing Overview | P/R: connect existing UI, including original temporary vault unlock and private references | `encrypted-transfer-matching.test.mjs`, `transfer-matching.test.mjs` |
| Account migrations | existing Overview/migration review and eligible execution | P/R: connect only the actual completed variants; earlier “all read-only” inventory statement is obsolete | `atomic-space-migrations.test.mjs`, `space-migration-review.test.mjs` |
| Help/profile/admin/settings | `/about`, `/settings`, existing section links | C/P: Help/appearance/native management exist; profile/admin and remaining original settings need connection | existing auth/client tests and Help evidence in checkpoint |

The remaining work is UI connection and verification of these actions, rather than product-feature development. The grouped report engine, vault, source-aware undo, transfer/schedule models and eligible migration services already exist. Verified-backup source cleanup remains an explicit pre-existing limitation (`cleanupEligible:false`) and is outside this frontend completion scope.

## Changes executed in this checkpoint

- Extracted original `inboxBase`, `inboxBuild`, merchant grouping and version-1 draft serialization/revision witnesses into `src/report-inbox-controller.js` and the existing statement model. The original UI calls the extracted functions; React's bank/card preparation and draft saving now call the same original code. No second report engine or draft version was added.
- Restored optional card categorization: unknown merchants can stay `לסיווג`, while manual duplicate decisions, signed cents, installment originals, source hashes and account checks remain enforced. The existing atomic service test now covers deferred progress → reload → import without changing another identity.
- Added allowlisted presentation destinations in `src/interface-destination.js`. Original-interface bridges retain selected space/valid period and can open the exact stored report after authenticated loading. They refuse restored edits, wrong scope and viewer report editing. Navigation URLs carry no raw rows, credentials or financial action. Settings exposes scoped original actions explicitly; a generic home link no longer stands in for these connections.
- Reconciled the released original-interface theme identified by the live-source audit, retaining its device preferences and regression tests.

## Verification and next action

The exact app checkpoint passed build/typecheck, **863 regression tests** and **15 core checks** before the final defensive malformed-route-ID handling; its focused adapter check and final build are recorded with this checkpoint. Original mixed/activity/refund/duplicate/undo guards remain in the suite. No new browser/device acceptance is claimed: normal discovery, a fresh tool session and the user's enabled setting still return “Local browser use is disabled in Work settings.” Do not bypass this with another browser automation mechanism.

Stage 1: live source verified; workflow-level connection inventory updated; exhaustive action/device acceptance remains. Stage 2: shared original orchestration/drafts, optional-category parity and grouped/mixed-source UI are connected and service-tested; source-aware editing/undo and full UI acceptance remain. Stage 3: existing actions remain explicitly reachable; remaining React connections stay P. Stage 4: code checks pass, browser/device gates open. Stage 5: not started; production and Sites unchanged.

Next: verify the changed report/bridge/theme paths in the authorized browser once the setting/tool mismatch clears, then complete source-aware editing/undo and the remaining original-action connections. Group controls already use `buildReportInbox`, `changeReportInbox` and `reportInboxDraftForWrite`. Do not expand single-source commands into another orchestration engine. Continue through the listed existing-action connections and acceptance gates before a release.


## Native group connection follow-up — 2026-10-28

The original field-change handler and payer selection were also extracted into `changeReportInbox`/`reportInboxPayer`, and the original UI calls them. New `/upload/group` and `/upload/:id/group` controls call these existing operations for mixed bank/card sources, existing/new target/payer mapping, sheets/ambiguous structures, activity dates/verified totals, source ranges, optional card categories, bank classification/refunds, explicit duplicate/direct choices and protected-month skips. The library selects up to ten sources and retains complete saved groups. Signed source rows, original installment amounts, per-account monthly proposals, source balance dates and activity exclusions are visible. The original20MB group limit is retained. No new financial engine, parser, server endpoint or draft version was introduced.

Group loading verifies every stored source byte hash and revision witness, expands the complete active saved group, preserves original choices/setup and retries failed parsing through the existing reader. Distinct saved groups cannot be merged or silently overwritten. Progress uses the existing atomic `draft-batch`; final import uses the existing atomic `commit`. Uncertain writes lock to the same action, exact lost commits recover without replay, and per-source failed states retain original semantics. Scoped backup, final confirmation and draft/navigation guards are connected.

Build/typecheck, **869 regression tests** and **15 core checks** pass; a final currency-display guard receives build/typecheck verification without claiming a fresh browser run. Six new real isolated-service contracts use actual synthetic CSV bank/card bytes and verify complete group progress/resume from either member, lost successful mixed commit without replay, refusal to drop a saved member, stale-member atomic rollback, lost-progress idempotency, actor-switch refusal, and failed-source reparse/recovery. No real record or production/Sites change. Browser use still returns disabled through normal discovery, fresh session and ordinary IAB creation despite Tal's enabled setting. New group browser/device acceptance remains open.

Remaining report limits include original-interface handling of already-committed source reuse for later activity cycles/reimports, source-aware imported account/card/monthly editing, bank import undo, verified-backup cleanup's existing non-capability, and remaining source-management acceptance. Native group wiring does not certify all report variants or release readiness.
