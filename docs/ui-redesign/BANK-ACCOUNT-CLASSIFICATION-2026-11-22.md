# Bank-account-specific movement classification — local prototype

Tal approved publication with “publish it”. Release `v1.6.0`, application `9b46647b`, build `59590933a1`, is verified live on 2026-11-23. No financial records or bank-account scopes were edited by the agent. See `evidence/release-bank-account-classification-2026-11-23.json` for release gates and the safe initial rollback/retry.

- Added optional expense fields `rent` (שכירות) and `houseCommittee` (ועד בית) to the existing shared budget model and bank importer. Missing fields in older budgets, monthly records and account records remain valid zero expenses; no stored amounts are migrated or reclassified.
- Retained `personalInvest` and `sharedInvest`, with the clearer labels השקעות פרטיות and השקעות משותפות. Existing investment totals and accounting semantics are unchanged.
- The receiving bank account, not the budget/space, determines the report selector. Only cards with an authoritative payer link to that account are offered. Names, issuers and bank identity do not establish payer ownership.
- Added optional `cashPlanning.accounts[].classificationScope` (`personal` / `shared`) in the existing guarded account editor. Personal accounts offer personal saving/investment types; shared accounts offer shared saving/investment types. Tal clarified that rent and house committee apply only to the shared bank account: they are offered only when the receiving account is explicitly `shared`, never for personal, unknown, missing or conflicting account scopes. Generic expenses, transfers and loan repayments remain available subject to existing direction/refund guards.
- Unknown account types retain both saving/investment families until explicitly configured. The report links directly to the account editor. The legacy bank-import `personal` flag governs private classification rules, not account ownership, and is not reused.
- A current classification outside the filtered options remains visible as a disabled selected option with an explanation. Filtering does not silently replace it or rewrite a saved choice, report or monthly total. This is presentation filtering, not a new financial classification engine or an access-control boundary.
- Scope changes use the existing explicit-save, revision-conflict and draft-protection workflow. Old five-field account drafts remain supported; no scope is inferred or cleared by a legacy draft.

## Validation and review

Release-candidate validation after isolating the approved patch against current production: build/typecheck, 1,504 application/reader regression tests, 15 core checks, 20 dedicated synthetic browser checks and `git diff --check` pass. Earlier local app-only validation passed 1,428 tests. The interactive selector artifact renders without console errors at 390 / 767 / 768 / 1440px. Actual app report and account-editor widths were checked in the dedicated browser script, including both sides of the breakpoint and light/dark report views. Contracts also verify that prior rent and house-committee choices remain intact in review and resumable drafts even when outside the new account filter.

An additional run of the existing `scripts/check-classification-review.mjs` did not finish: it timed out locating the card-review checkbox `/בדקתי ואני מאשר/` at line 45. Its earlier layout and category checks passed. No full broader-browser acceptance is claimed; this unrelated card-completion selector was not changed as part of the bank-account work. PDF fixture setup also reports its existing optional canvas/polyfill warnings; the bank-specific browser checks have zero page runtime errors.

Run `node build.mjs`, `node --test test/*.test.mjs` and `node verify.mjs`.

Focused contracts: `test/housing-movement-types.test.mjs` and `test/bank-account-classification.test.mjs`.

Run `node scripts/check-bank-account-classification.mjs` with the existing `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE` overrides if needed. It uses disposable in-memory accounts and tests report filtering, the real guarded account metadata save, unchanged financial records and 390 / 767 / 768 / 1440px layouts. Synthetic browser evidence is not physical-iPhone/PWA acceptance.

Generate the interactive review artifact with `node scripts/preview-bank-account-classification.mjs`; output: `work/ui-redesign/bank-account-classification/preview.html`. Its option lists come from the actual selector model and use synthetic accounts. It is a bounded selector demonstration, not the running application.

Approval was obtained before any push or release. Fresh backup, isolated preflight, restore/compatible-rollback and runtime verification gates passed. Rollback must retain support for newly saved housing keys and account metadata; the retained rollback image includes the compatible budget model. Any further proposed change needs its own review and approval.
