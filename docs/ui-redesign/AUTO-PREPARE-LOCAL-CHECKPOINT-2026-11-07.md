# Phase 2 preparation checkpoint — 2026-11-07

Active source remains `work/budgit-household-ui`, branch `codex/budgit-household-ui`. The separately published statement-comparison repair is retained through parent checkpoint `6e82745`. This continuation does not deploy or activate Phase 2. Unrelated outer checkout edits remain preserved.

## Implemented boundary

The existing service now has an experimental preparation capability behind `BUDGIT_REPORT_PREPARATION=1`; it is off by default and forcibly off in recovery-check startup. Even when available, each budget owner must explicitly consent before preparation starts. There is no automatic financial application or Phase 3 implementation.

Supported single bank/card sources reuse the original bounded CSV, XLS/XLSX and PDF readers, confirmed identity mappings, report inbox controller, version1 draft serializer, encrypted report store, notices and atomic manual import. Unknown, ambiguous, mixed, unsupported, locked and unauthorized destinations remain uncommitted for manual attention. Server-side preparation does not unlock budget vaults. Token receipts remain connection-scoped and do not acquire financial approval capabilities.

Preparation records source hash, parser/build version, destination, financial revision, mapping/policy revisions, encrypted summary, exact saved-draft witness and a proposed-plan hash. The UI offers opt-in/pause, before/after monthly totals, new/duplicate/conflict/question counts, separate issuer notices, regeneration, rejection and the original transaction review/confirmation. Existing human-edited drafts are never replaced. Partial bank months carry an explicit warning and do not qualify in the provisional Phase 3 shadow evaluation. Shadow comparison records unchanged/corrected results only after an original financial commit; it never applies a proposal.

## Takeover repairs

- Durable queued/interrupted work resumes in bounded batches through the existing minute maintenance timer. Paused policies, revoked actors and lost budget ownership prevent preparation; the disabled service's timer is a no-op.
- Original actor, role, policy, source, mapping and financial revision checks remain before routing and saved progress. Re-preparing while paused returns an actionable refusal rather than a successful-looking no-op.
- Backup change tracking includes policies and encrypted proposals, including deletion. Lease timestamp-only updates do not trigger changed-data backup work.
- The panel resets consent/rejection/message state on actor or budget changes. Draft guards precede switching. A budget cannot inherit another budget's consent.
- Single-report statement conflicts link directly to the existing native comparison. Upload text describes storage accurately when automatic preparation is enabled, and internal question identifiers are replaced with Hebrew guidance.
- Browser acceptance found the native file input overflowed at 320px. It now fits its container with a 44px minimum height.

## Validation

Build/TypeScript, **1,296 application and reader regressions**, **15 core checks** and `git diff --check` pass. Fourteen preparation contracts cover original manual import equivalence, unchanged/corrected shadow results, signed Cal refunds/installments and separate notices, no preapproval financial writes, unknown identities, duplicate delivery, concurrent arrivals, interrupted leases, paused policy, human progress preservation, actor/ownership changes, shared viewer/editor refusal, locked-vault summary redaction and backup tracking. Existing original group/conflict/import recovery tests remain passing.

Disposable browser acceptance verifies explicit owner consent, mapped bank upload to a ready proposal, a 0.00→100.00 synthetic salary comparison, exact original review destination with unchecked final financial confirmation, guarded rejection/stay, rejection without financial changes, pause, guarded budget switch and cleared consent in the new budget. Initial 320px native file-input overflow was reproduced and fixed; final 320px Dark, 390px Light and 1440px layout observations have no document overflow. The 390px screenshot was visually inspected. Fixture audit retained the original financial hash with zero report commits throughout this browser flow. No real records or provider credentials were used.

Evidence: `evidence/phase2-preparation-local-2026-11-07.json`. Detailed logs and synthetic screenshots remain outside Git. Service lost-response tests exercise actual original atomic commits only in isolated in-memory fixtures.

## Remaining acceptance and release

This is a bounded local preparation checkpoint, not completion of the three-phase plan's exit criteria. Complete representative issuer/layout and multi-account/manual-attention acceptance, latest Cal proposal browser checks and recoverable failure/reload cases before a Phase 2 rollout. Actual iPhone scheduling, locked-device and Files/provider outcomes remain unverified; existing successful owner delivery evidence is not a scheduled-run claim. No Phase 3 eligibility promotion or automatic financial application is authorized by the provisional shadow records.

Publication still requires exact-source backups, fresh live reconciliation, a verified SQLite backup, both new tables in startup/restore/preservation checks, isolated financial/access/decryption/HTTP and rollback/retained-asset gates, then runtime verification. The production capability flag and user policies have not been enabled here. The separate statement-review release does not establish these Phase 2 gates.
