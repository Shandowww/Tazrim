# Remaining original connections — 2026-10-29

This is a source mapping for completion-plan stage3, not a new product plan or evidence of device acceptance. Continue the original commands and their revision/actor/source witnesses. Missing native UI does not mean the capability is missing from Budgit. Current verified checkpoint passes1069 regressions, build/typecheck and15 checks. Bounded synthetic desktop/390px browser acceptance for the consumption/family/periodic slices is documented below; broader device acceptance remains pending.

## Scope decision — 2026-10-29

Tal explicitly abandoned the Apple Pay connection. Apple Pay/Wallet/Shortcuts development, native monthly-draft handoff and related acceptance are excluded from the remaining plan and release gates. Existing code, stored records and live connections are unchanged by this scope decision; it is not a deletion, credential revocation or deployment. Historical implementation/test evidence remains historical. The next connection is insight scenarios and anomaly follow-up.

| Remaining connection | Existing implementation to reuse | Existing evidence / boundary |
| --- | --- | --- |
| Insight scenarios and anomaly follow-up | `setInsightScenario`, `simulateInsightScenario`, `insightScenarioActuals`, `expenseAnomalies`, `decideExpenseInsight`; `src/insight-scenarios-client.js`, original reports | `insight-scenarios.test.mjs`, `insight-followup.test.mjs`, `planning-insights.test.mjs`. These differ from the already connected purchase calculator/scenario editor. Retain immutable baseline, missing/pending/changed evidence and actual-only comparison; projected reduction is not achieved saving. |
| Period review and advanced source/coverage actions | `setPeriodReviewed`, `periodReviewState`; `src/reports.js` and original consumption/reconciliation UI | Original source-witness/client suites. Closing/reopening is evidence-sensitive. New native `analysis` read/filter/view/reset functions do not implement every original report mutation. Exact original analysis space/month bridge remains. |
| Global server allow-list UI | `server/app.mjs` `/api/admin/access`; `src/client.js` `drawAdminAccess`/`standaloneAdminAction` | `standalone-auth.test.mjs`, `tazrim-admin-destination.test.mjs`. Exact original admin destination now exists and only auto-loads for the authenticated administrator. A native UI must retain original revision CAS and administrator protection, with expected-actor metadata/preflight consistent with other native services. Granting server login access does not share a budget. All tests must use synthetic lists; do not change live access to test UI. |
| Global action overlays/save-error badges | `src/action-center-model.js`, `src/action-center-client.js`; native action facts/preferences and `draft-registry.ts`/`draft-guard.tsx` | `action-center.test.mjs`, `tazrim-action-center.test.mjs`, `tazrim-action-integrations.test.mjs`. Optional Gmail/private notices/admin-backup facts are already connected. An ordinary dirty draft is not a failed save. The current native registry exposes dirty/busy/save availability, not an error channel; connect actual scoped error evidence instead of inferring it. Preserve original announcement/read/snooze CAS and navigation protection. |

Read `execution-status.md` for the exact accepted slices. The original analysis destination retains allocation/consumption/family/periodic/scenario/coverage tools. Native admin controls are still pending despite the exact original destination.

## Connected in this continuation — 2026-10-29

Manual bank consumption/category review and explicit partial/cross-month source allocations now call the original models. The original editor eligibility/remaining-cent projection is shared by both interfaces. Create/remove/reset retain source snapshots and stale invalidation. Family category/purchase choices and category-record drill-down call the original review models; category gaps and whole original purchases remain separate. Guarded prepared saves handle plaintext/unlocked vaults and uncertain writes without duplicate financial writes. See `execution-status.md` for exact bounded synthetic browser/service evidence. Full device, shared-viewer browser and live-release gates remain.

Periodic cost create/edit/remove, manual paid/unpaid and explicit source link/unlink now call original models. Original form capture and source-selection projection are shared by both interfaces; submitted month values are captured directly and the confirmation identifies name/amount/due month/repeat. Original payment/source evidence remain separate. Synthetic browser verified lost creation once, cross-month source link without a paid mark, manual annual advancement/undo, draft guard and390px RTL/no-overflow.

## Acceptance and release

Fresh browser/keyboard/phone checks remain for imported/savings migration, settings-draft summary, Drive, Gmail filters/notices/OAuth and analysis. Existing server/model or render contracts are not device acceptance. Real platform PRF/Face ID remains unverified. Do not claim them from mocked OAuth, synthetic receipts or desktop dimensions.

The current production baseline was previously verified read-only as `a79488b`; no deployment was performed in this continuation. Retain the established live reconciliation, fresh verified SQLite backup, isolated financial/access/HTTP preflight, rollback image/source and runtime hash/health/auth/deep-route/parking gates. Sites remains unchanged. Unrelated canonical WIP stays untouched. Verified-backup cleanup and original-absent bank-account deletion are not additional requirements.

## Final source review

New account-bound read/write adapters keep the original service ownership and revision checks. Drive unknown writes are checked through status without another run. Gmail unknown scans are checked without replay; configuration/notice recovery reuses original revisions. Shared source models, filenames and signed original values remain distinct from displayed/split amounts. No real Google, phone, allow-list, financial-record or hosting operation occurred.

The final review found that the Gmail settings editor reused an aborted controller during StrictMode effect replay. Each effect setup now owns a fresh controller and aborts only that instance on cleanup. The exact source passes build/typecheck,1060 regressions and15 checks; browser reproduction/acceptance is still pending under the current tool blocker.
