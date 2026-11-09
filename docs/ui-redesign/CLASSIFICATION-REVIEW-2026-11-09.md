# Clear transaction classification during report review

Status: final implementation `f96c277` passes build/typecheck, 1,358 regressions, 15 core checks and 29 synthetic interface checks. Application `f96c277` is verified live; see [release evidence](evidence/release-classification-review-2026-11-09.json).

## Verified baseline and diagnosis

The authoritative application checkout is `work/budgit-household-ui`, branch `codex/budgit-household-ui`. The initial baseline was documentation checkpoint `1112b81`, with application `86f4857` live. Both `report-group-page.tsx` and the shared inbox controller matched the server byte for byte. The older canonical and managed frontend worktrees were preserved. The final checkpoint incorporates the concurrent `5d86c8b` card-layout release and its documentation without changing that work. Implementation uses an isolated `codex/report-classification-review` worktree because another chat is concurrently improving the card layout.

A scoped read-only diagnostic against an existing server backup reproduced the reported `file.pdf`: seven bank rows, all seven in `conflict` state, seven `duplicate` questions, and zero pending new-classification groups. The user was shown an empty classification stage because the UI displayed only unresolved **new** rows; matching conflicts were rendered in the next stage. The generic issue count did not explain this. No source content, identifiers or financial values are included in this evidence, and the diagnostic never wrote to the production database.

## Existing commands and bounded changes

- `buildReportInbox` / `changeReportInbox` in `src/report-inbox-controller.js` remain the original shared review orchestration. Existing grouping, matching, month, sign/refund, revision and atomic import rules are retained. A presentation-only list of all eligible new bank groups exposes the original group choice for automatic and previously selected classifications. The unresolved-only group list and its issue accounting remain compatible with the original UI.
- `report-classification-model.ts` projects all source rows and original pending questions into statuses and exact navigation targets. It does not classify, match, import or mutate a budget.
- `report-classification-review.tsx` shows current classifications, automatic/manual/suggested/existing/conflicting states, explicit group effects, and eligible original-command editors. Bounded lists expose every row/check through More controls. Existing imported card details link to the original annotation editor under existing draft guards; imported bank rows remain protected.
- `report-group-page.tsx` connects exact check navigation/focus and distinguishes required bank decisions from optional card categories. It replaces generic completion radios with factual counts, explicit category deferral or an explicit choice to leave remaining purchases uncategorized. The original `unset` / `later` / `resolved` lifecycle values and final financial approval remain authoritative. Review progress never imports financial changes.
- An explicit empty card category is now retained using `Map.has`, allowing a user to clear an inherited category while preserving existing imported details.

The classification view explains bank-budget treatment separately from expense-analysis categories. Matching conflicts show an unconfirmed suggestion and a direct decision link; they never become editable merely by opening the view. No new report engine, financial capability, storage schema or server endpoint was introduced.

## Verification

Focused contracts cover the seven-conflict reproduction, persistent visibility and editing of automatic/manual bank groups, exact-cent arithmetic, saved-draft round-trip, refund directions, protected/imported rows, explicit empty optional categories and stable exception anchors. The complete regression suite includes the original encrypted-report, actor/viewer/revision, grouping, atomic retry and duplicate/retention contracts.

The synthetic interface check exercises bounded/full lists, exact check focus, bank editing/reload, lost-success progress recovery, explicit deferral versus uncategorized completion, final financial confirmation, shared viewer refusal, Hebrew RTL, narrow and desktop widths, dark appearance and reduced motion. It also injects a failed recalculation, verifies that the last usable rows remain read-only, and retries the intended unsaved choice without stale saving. It audits unchanged financial records/history and zero financial writes.

Physical iPhone acceptance remains unverified. Exact final test counts, release hashes, source backups and production-preservation receipts are recorded after the release gates complete.

## Verified publication

The existing server now runs `f96c277`. All 474 prior source files matched the concurrent `5d86c8b` release; all 167 candidate and live runtime files match the exact tested build. A fresh verified SQLite backup, isolated financial/access/21-source decryption/startup/rollback/intake/automation restore, 68 retained assets and 32 candidate contracts passed before activation. The previously stale release marker was reconciled from the verified source and immutable runtime image. Activation preserved all 50 authoritative tables, configuration keys and adjacent services. Public health, auth/forgery refusal, deep routes, no-store behavior, root preferences, manifest and unchanged signed installer passed.

The original reported source was not imported or completed by the agent. Its seven matching decisions remain explicit user decisions. No stored report original, financial record, privacy audience or preparation opt-in was changed by testing or publication.

Current application source remains `work/budgit-household-ui`, branch `codex/budgit-household-ui`; the isolated review worktree is retained as implementation provenance. Both source backups are updated after this evidence checkpoint. Physical iPhone acceptance remains a user follow-up.
