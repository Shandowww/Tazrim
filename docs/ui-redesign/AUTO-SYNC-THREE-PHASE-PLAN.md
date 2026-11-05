# Budgit report automation — three-phase plan

Requested by Tal, 2026-11-05. **Planning only: no automatic report processing or financial posting is enabled by this document.**

## Meaning of each operation

- **Sync:** deliver the original file securely into the user's private incoming inbox and verify its upload receipt.
- **Digest:** extract supported report content, identify its account and period, reconcile it through existing Budgit rules, extract issuer notices, and prepare a proposed update.
- **Apply:** commit that update to the selected budget using its existing atomic commands and revision checks.

**Phase 2 interpretation:** the app prepares changes automatically, then the user reviews and approves them **before financial records change**. Phase 3 allows eligible changes to be applied without that approval. These automation levels are independent of Basic / Advanced / Expert interface modes.

## Shared foundation: one folder per user

Use one user-selected iPhone folder, a signed Shortcut, and a scheduled sweep with a manual Run option. Apple documents Time of Day and App automations; its current list does not include a generic Files-folder-added trigger. Scheduled delivery is feasible, but instant background monitoring by the Budgit web page is not the delivery mechanism.

The server already has encrypted report storage, upload connections, hash deduplication, receipts, supported parsers, report review and atomic import. The folder Shortcut remains an unfinished prototype: its last recorded complete native run stalled at folder resolution before uploading. Resolve that first; a signed file alone is not a working workflow.

Current connections are bound to **one user and one budget**. For one folder containing both personal and shared reports, add a **user-private incoming inbox** and a narrowly scoped intake connection. The intake token can upload and check its own receipts; it cannot choose arbitrary budgets, read financial records or approve changes. After routing is authorized, hand the original into the existing target-budget report workflow. Preserve a stable intake receipt linked to the target report; moving scope must not break acknowledgement/retry behavior.

Require exact file-byte receipt/hash acknowledgement before moving a file into an Uploaded subfolder. Never delete originals, overwrite a same-named destination, or move changed bytes on an old receipt. Interrupted uploads, missing permissions and quotas leave files available to retry. Preserve server duplicate detection and visible per-file outcomes.

## Phase 1 — auto-sync; verify before digestion

**User outcome:** download a report into the folder; Budgit receives it and asks permission before analyzing it.

Flow: **Download → auto-upload → user verifies file and destination → digest → existing review/save.**

### Deliver

1. Finish the folder Shortcut, per-user setup, connection creation/revocation, schedule instructions and last-success/error display in Budgit.
2. Create the private incoming inbox. New arrivals show filename, file type, size, received time and original-file access, with **ממתין לאישור פענוח**.
3. Permit only transport/storage validation before verification: size/type checks, hashing, duplicate detection and encryption. **No automatic report extraction, OCR, classification, account/month inference, issuer-notice extraction, or financial proposal before approval.** Opening the original for the user's own verification remains possible.
4. The user confirms the original and its intended budget/account, then chooses **אישור פענוח**. Persist approval against that exact source hash, user and authorized destination.
5. Call the existing parser/review flow. The current explicit financial save remains; approval to read a document is not permission to apply arbitrary financial changes.

### Exit criteria

- Real iPhone folder access and an actual scheduled run succeed using synthetic files first.
- Parser/notice/financial-command counters remain zero until verification, including after retries or server restart.
- Two users' inboxes are isolated; wrong-budget choices, revoked connections and viewer permissions cannot bypass authorization.
- Duplicate delivery, changed files, unavailable iCloud files, locked-device behavior, network loss and destination collisions have explicit tested outcomes.
- Pending verification does not falsely mark a report as financially imported or satisfy an expected-report requirement without its validated account/period.

## Phase 2 — auto-sync and digest; review proposed changes

**User outcome:** download the report; Budgit prepares the work and asks for a decision-ready review.

Flow: **Download → auto-upload → auto-digest → before/after review → user approves → apply.**

### Deliver

1. After an explicit per-user/per-budget automation setting, digest supported arrivals automatically with bounded work on the existing service. Reuse the original parser, reconciliation and import commands.
2. Route using confirmed bank/card identifiers and authorized account mappings. Filename or a similar amount alone is not enough. Unknown identities, multiple possible budgets and changed layouts enter **דורש טיפול**.
3. Produce a versioned draft tied to source hash, parser version, account/period, destination budget and the financial revision used for reconciliation.
4. Show **מוכן לבדיקה** with a compact before/after summary: affected budget/account/month, monthly totals, additions/corrections/duplicates, warnings and source evidence. Keep issuer notices separate from recorded charges.
5. Offer approve, correct, or reject. Approval rechecks permissions, source version and the current financial revision; stale proposals are refreshed for review instead of silently overwriting newer work.
6. Confirmed routing corrections can become explicit reusable mappings. Draft suggestions alone must not teach the system to treat an unverified mapping as trusted.

### Exit criteria

- Automatic preparation matches the existing manual workflow on representative supported statements, including signed refunds, installments, overlapping reports and multi-account files.
- No financial mutation occurs before approval. Notice extraction and a saved proposal are not reported as financial application.
- Corrections, concurrent saves, permission changes and lost responses preserve exact-once import semantics.
- Every proposal explains its changes; ambiguous/malformed/unsupported sources remain visible and uncommitted.
- Run a shadow evaluation recording which drafts would qualify for Phase 3, then compare that decision with actual user review.

## Phase 3 — full automation for eligible reports

**User outcome:** download the report; ordinary supported reports update Budgit automatically. The user receives results and handles exceptions.

Flow: **Download → auto-upload → auto-digest → deterministic checks → auto-apply → result summary.** Any failed check branches to review.

### Deliver

1. Add explicit opt-in by budget owner and enabled account/issuer layout. Start narrowly with sources validated during Phase 2; do not promote every source when a global switch changes.
2. Auto-apply only when identity, budget, statement period, parser support, reconciliation totals, duplicate/correction rules, current permissions and revision checks all pass. Reuse original financial semantics, including installment and payer protections.
3. Preserve idempotent action IDs and source/cycle receipts. A timeout after commit must recover the same result rather than repeat the financial operation.
4. Record actor/automation identity, policy version, source evidence and before/after effects. Provide a verified correction/undo path for each enabled report family; concurrent later edits must be protected. A whole-database restore is not an ordinary per-report undo.
5. Send an in-app results summary after actual success. Group normal successes; elevate unknown accounts, altered report formats, discrepancies, duplicate conflicts, quota/auth failures and overdue reports that never arrived.
6. Provide Pause, revoke connection and return-to-review controls. Recheck automation policy immediately before applying queued work; lowering a mode prevents future automatic commits but does not misrepresent already completed ones as canceled.

### Exit criteria

- At least two representative statement cycles per enabled issuer layout pass shadow comparison, followed by a supervised live acceptance run.
- Recovery, duplicate delivery, wrong-account routing, concurrent revisions, role revocation and per-report correction are proven for each enabled report family.
- Exceptions never disappear behind a general “all synced” status, and a missing report never becomes an invented zero balance/charge.
- Begin rollout with selected accounts; broaden only after reviewing actual results.

**Full auto means no routine user approval for eligible reports. It does not authorize guessing unknown financial facts.** Reports that fail eligibility still require attention.

## Cross-phase boundaries

- Preserve the existing monthly cash-flow model; do not turn Budgit into a different individual-transaction product to accommodate an integration.
- Remain within existing hosting and resource limits. Use bounded orchestration and retry/backoff; no new paid service, large queue platform or mandatory AI service is proposed.
- Keep consent for server-readable report storage distinct from budget-vault encryption. An encrypted budget that requires an unlocked device may prepare what is permitted, but financial reconciliation/application waits for unlock. Do not claim unattended Phase 3 for a locked vault or place its password in a Shortcut.
- Keep each account's capability explicit: automatic upload, parsing and financial application are separate states. “Supported files” does not promise every PDF layout, OCR scan, password-protected document or oversized source.
- Use the existing action center with statuses such as **התקבל**, **ממתין לאישור פענוח**, **מוכן לבדיקה**, **הוחל**, and **דורש טיפול**. Report sync freshness and budget-update freshness separately.

## Comparable implementations and what to reuse

Official product documentation was checked on 2026-11-05. These products supply design patterns, not evidence that Budgit's iPhone workflow already works.

| Product | Documented behavior | Useful Budgit pattern | Important fit limit |
| --- | --- | --- | --- |
| Paperless-ngx | A consumption directory receives documents; automatic OCR/indexing and matching can run; its recommended workflow uses an inbox tag until the user checks the document and removes it. | Private incoming inbox, explicit pending-review state, retain originals, confirmed mappings reused for later documents. Closest model for Phase 2. | Its normal consumption flow analyzes immediately, so Phase 1 needs our own approval gate before the parser. It runs where the monitored directory is accessible; it does not solve iPhone delivery. |
| n8n | Human-in-the-loop tools pause a workflow, show the intended action/parameters, then execute only on approval; denial cancels the action. | Place a durable approval gate before digestion in Phase 1 and before applying in Phase 2. Approval must bind to the exact operation/version. | The documented feature is for AI-agent tools. We borrow the pause/approve/resume pattern without adding an AI agent or hosting n8n. |
| Hazel | A Mac utility watches selected folders and uses rules to organize, rename, tag or upload files. | Folder-to-inbox delivery with explicit rules and bounded file handling. | Mac-specific; not an iPhone background watcher. A Mac bridge would add a runtime dependency, so the preferred delivery remains an iPhone Shortcut. |
| Actual Budget | File import matches likely existing transactions to avoid duplicates; its documentation describes imported data taking precedence on a match. | Treat retries and duplicates as a first-class intake concern. | Do not copy fuzzy financial merge behavior blindly or adopt its transaction model; keep Budgit's exact source hashes, source/cycle receipts and existing reconciliation guards. |

### Recommendation

Build a **Paperless-style incoming inbox + n8n-style approval gates + explicit folder rules** on the existing Budgit backend. Reuse the verified parts of our native Shortcut generator and current upload/import services. Implement Phase 1 first, retain the same pipeline for Phase 2, then add narrowly scoped automatic-application eligibility for Phase 3.

The main uncertainty in Phase 1 is native folder/provider access and scheduling. Phase 2 adds the orchestration and routing work. Phase 3 adds operational proof and safe recovery; it is more than removing an Approve button. A calendar estimate should follow resolution of the native folder-access blocker.

### Sources

1. Paperless-ngx usage and recommended workflow: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/usage.md
2. Paperless-ngx matching: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/advanced_usage.md
3. n8n human review: https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools
4. Hazel official feature overview: https://www.noodlesoft.com/
5. Actual Budget file import/deduplication: https://actualbudget.org/docs/transactions/importing/
6. Apple automation triggers and unattended-run settings: https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios

The Paperless documentation site returned HTTP 403 during this research; its official repository documentation was read instead. No third-party product was installed, connected to Budgit, or given financial data.
