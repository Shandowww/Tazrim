# Budgit report automation — three-phase plan

Requested by Tal, 2026-11-05; amended 2026-11-08. **This document describes the rollout; editing it does not enable any policy.**

**Current baseline:** bounded Stage 2 preparation, guided review, lifecycle labels and 30-day server-original retention and opt-in verified-upload device cleanup are published as `0a5ab68`; see [release evidence](evidence/release-day0-device-cleanup-2026-11-08.json). Owners explicitly opt in per budget and financial approval remains mandatory. The published Shortcut defaults to retain and offers explicit `delete-after-upload` after a fresh exact-byte storage proof. Phase 3 is not enabled; physical iPhone scheduling/locked-device outcomes remain unverified.

**Execution handoff:** implementation remains assigned to **Sol 6.1**. Resume using [the handoff](AUTO-SYNC-SOL-6.1-HANDOFF.md). The implemented amendment is [day-0 device cleanup after verified upload](REPORT-GUIDED-REVIEW-AND-RETENTION-2026-11-07.md#day-0-device-cleanup-amendment--2026-11-08), while retaining Budgit's copy until 30 days after complete handling. This device cleanup is live; Tal confirmed a manual iPhone run without Delete confirmation after enabling the device setting. Scheduled/locked-device/provider acceptance remains separate.

## Meaning of each operation

- **Sync:** deliver the original file securely into the user's private incoming inbox and verify its upload receipt.
- **Digest:** extract supported report content, identify its account and period, reconcile it through existing Budgit rules, extract issuer notices, and prepare a proposed update.
- **Apply:** commit that update to the selected budget using its existing atomic commands and revision checks.

**UI completion wording:** “Digested” / **עוכל** means fully handled and durably saved (or proven already recorded), with no remaining review work. Extraction and a prepared proposal alone do not earn that label. **New / Partly digested / Digested** are lifecycle labels; preparation/error details remain secondary.

**Phase 2 interpretation:** the app prepares changes automatically, then the user reviews and approves them **before financial records change**. Phase 3 allows eligible changes to be applied without that approval. These automation levels are independent of Basic / Advanced / Expert interface modes.

## Shared foundation: one folder per user

Use one user-selected iPhone folder, a signed Shortcut, and a scheduled sweep with a manual Run option. Apple documents Time of Day and App automations; its current list does not include a generic Files-folder-added trigger. Scheduled delivery is feasible, but instant background monitoring by the Budgit web page is not the delivery mechanism.

The server has encrypted report storage, private intake connections, hash deduplication, receipts, supported parsers, report review and atomic import. A signed folder-first installer is published. That does not certify scheduled, locked-device or every Files-provider behavior; physical acceptance remains a separate gate. Historical QA import links and temporary endpoints are not the production installer.

Legacy report connections are bound to one user and one budget. The current **user-private incoming inbox** adds a narrowly scoped intake connection for a folder containing both personal and shared reports. The intake token can upload and check its own receipts; it cannot choose arbitrary budgets, read financial records or approve changes. After routing is authorized, hand the original into the existing target-budget report workflow. Preserve a stable intake receipt linked to the target report; moving scope must not break acknowledgement/retry behavior.

**Device cleanup — amended 2026-11-08:** Tal prefers deleting the source file during the same successful Shortcut run after Budgit confirms durable, retrievable storage of the exact original in the user's private inbox. Offer this as explicit setup with a retain option; existing installations must not silently start deleting. Full digestion is no longer a prerequisite for local cleanup. Use a fresh connection-owned storage receipt and re-enumerate/hash the current file before native deletion. An upload error, uncertain/mismatched receipt, changed source or unavailable/removed server copy leaves the local file intact. Honor Files permissions; deletion in an iCloud folder may propagate to other devices. A completed-but-removed acknowledgment prevents duplicate import but does not prove a retained copy for local deletion.

**Server retention is separate:** New and Partly digested originals stay in Budgit until finished. Full completion starts a 30-day timer; then the server removes the sync entry and stored originals, preserving financial data/history and deduplication evidence. There is no device timer and no need to wait for another Shortcut run on day 30. Read the linked day-0 receipt/native acceptance contract before changing the signed installer; do not weaken existing financial-completion proof or Phase 1's approval-before-parsing gate.

## Phase 1 — auto-sync; verify before digestion

**User outcome:** download a report into the folder; Budgit receives it and asks permission before analyzing it.

Flow: **Download → auto-upload → user verifies file → digest and identify account → route by identifier → existing review/save.**

Tal clarified that the report's account number or card digits should select its account automatically. After permission to read the exact file, reuse confirmed identifier mappings across the user's personal/shared budgets. A unique issuer/card-digit match can suggest the initial account; unknown, missing or colliding identifiers need a one-time explicit choice. Do not use a filename, bank name alone, or the only visible account as automatic routing evidence. The first approval permits extraction and account matching, while financial application retains its existing separate confirmation.

For a bank, match the bank/account identity actually extracted from the report, including branch information when the format provides it. For a card, use issuer plus the available card digits. Search all authorized destinations; a collision or an inaccessible/locked destination must remain explicit. A confirmed mapping should be reused rather than asking for the same assignment on every report.

### Deliver

1. Finish the folder Shortcut, per-user setup, connection creation/revocation, schedule instructions and last-success/error display in Budgit.
2. Create the private incoming inbox. New arrivals show filename, file type, size, received time and original-file access, with **חדש** and secondary text **ממתין לאישור פענוח**.
3. Permit only transport/storage validation before verification: size/type checks, hashing, duplicate detection and encryption. **No automatic report extraction, OCR, classification, account/month inference, issuer-notice extraction, or financial proposal before approval.** Opening the original for the user's own verification remains possible.
4. The user confirms the original, then chooses **אישור פענוח**. Persist approval against that exact source hash and user before extracting any identifier.
5. Extract the account/card identifier with the existing reader. Resolve a confirmed authorized destination automatically; ask once for a missing or ambiguous mapping, and remember only an explicitly confirmed choice. Bind the routing receipt to the exact source, actor and authorized budget/account.
6. Call the existing parser/review flow. The current explicit financial save remains; approval to read a document is not permission to apply arbitrary financial changes.

### Exit criteria

- Real iPhone folder access and an actual scheduled run succeed using synthetic files first.
- Parser/notice/financial-command counters remain zero until verification, including after retries or server restart.
- Two users' inboxes are isolated; wrong-budget choices, revoked connections and viewer permissions cannot bypass authorization.
- Duplicate delivery, changed files, unavailable iCloud files, locked-device behavior, network loss and destination collisions have explicit tested outcomes.
- Pending verification does not falsely mark a report as financially imported or satisfy an expected-report requirement without its validated account/period.

## Phase 2 — auto-sync and digest; review proposed changes

**User outcome:** download the report; Budgit prepares the work and asks for a decision-ready review.

Flow: **Download → auto-upload → automatic preparation → guided report/account → extracted figures → categories → applicable exceptions → final summary → Finish and save.**

Use [the shared guided-screen and lifecycle specification](REPORT-GUIDED-REVIEW-AND-RETENTION-2026-11-07.md). Each part has its own clear screen with Back/Next; Finish is the final financial approval. New and Partly digested cards open/resume that flow. Saving review progress never implies a financial save. Automatic preparation reduces manual entry while leaving decisions interactive.

### Deliver

1. After an explicit per-user/per-budget automation setting, digest supported arrivals automatically with bounded work on the existing service. Reuse the original parser, reconciliation and import commands.
2. Route using confirmed bank/card identifiers and authorized account mappings. Filename or a similar amount alone is not enough. Unknown identities, multiple possible budgets and changed layouts enter **דורש טיפול**.
3. Produce a versioned draft tied to source hash, parser version, account/period, destination budget and the financial revision used for reconciliation.
4. Show **חדש** (or **עוכל חלקית** for resumed work) with secondary text **מוכן לבדיקה** and a compact before/after summary: affected budget/account/month, monthly totals, additions/corrections/duplicates, warnings and source evidence. Keep issuer notices separate from recorded charges.
5. Offer separate report/account, extracted-data, category, applicable-exception and final-summary screens using the existing review actions. Next saves review progress; Finish confirms the existing atomic financial save. Allow correction, rejection and saved-progress exit. Approval rechecks permissions, source version and the current financial revision; stale proposals are refreshed for review instead of silently overwriting newer work.
6. Confirmed routing corrections can become explicit reusable mappings. Draft suggestions alone must not teach the system to treat an unverified mapping as trusted.

### Exit criteria

- Automatic preparation matches the existing manual workflow on representative supported statements, including signed refunds, installments, overlapping reports and multi-account files.
- No financial mutation occurs before approval. Notice extraction and a saved proposal are not reported as financial application.
- Corrections, concurrent saves, permission changes and lost responses preserve exact-once import semantics.
- Every proposal explains its changes; ambiguous/malformed/unsupported sources remain visible and uncommitted.
- New/Partly digested cards start/resume the exact guided review. Back/reload preserves choices; category-only follow-up cannot replay an import. Complete duplicate handling adds no financial write.
- Verify lifecycle transitions and the 30-day cleanup preservation, original-byte removal, truthful receipts and backup/restore gates in the linked amendment before enabling retention.
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

**Full auto means no routine user approval for eligible reports. It does not authorize guessing unknown financial facts.** Reports that fail eligibility still require attention. Only these exceptional reports open the shared interactive decision flow, starting at the first unresolved step; ordinary successes become Digested without Next/Finish interaction. The same completion proof and 30-day retention rule apply.

## Cross-phase boundaries

- Preserve the existing monthly cash-flow model; do not turn Budgit into a different individual-transaction product to accommodate an integration.
- Remain within existing hosting and resource limits. Use bounded orchestration and retry/backoff; no new paid service, large queue platform or mandatory AI service is proposed.
- Keep consent for server-readable report storage distinct from budget-vault encryption. An encrypted budget that requires an unlocked device may prepare what is permitted, but financial reconciliation/application waits for unlock. Do not claim unattended Phase 3 for a locked vault or place its password in a Shortcut.
- Keep each account's capability explicit: automatic upload, parsing and financial application are separate states. “Supported files” does not promise every PDF layout, OCR scan, password-protected document or oversized source.
- The sync center uses **חדש / עוכל חלקית / עוכל**. Keep **ממתין לאישור פענוח**, **מוכן לבדיקה** and **דורש טיפול** as supporting progress/action text. Sync freshness, review progress and actual budget updates stay distinct.
- Thirty days after verified complete handling, remove the sync-center report AND its app-stored original. Preserve financial data, history and minimal completion/deduplication evidence; never expire New/Partial reports. This is distinct from optional local-folder deletion. See the linked retention contract for timestamps, shared references, backup behavior and truthful Shortcut receipts.

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

The remaining device uncertainty is scheduled/locked-folder delivery. Bounded Phase 2 preparation, guided review and lifecycle/retention are now published; verified same-run device cleanup is now published with explicit opt-in. Phase 3 still requires operational proof and safe recovery, beyond removing an approval button.

### Sources

1. Paperless-ngx usage and recommended workflow: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/usage.md
2. Paperless-ngx matching: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/advanced_usage.md
3. n8n human review: https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools
4. Hazel official feature overview: https://www.noodlesoft.com/
5. Actual Budget file import/deduplication: https://actualbudget.org/docs/transactions/importing/
6. Apple automation triggers and unattended-run settings: https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios

The Paperless documentation site returned HTTP 403 during this research; its official repository documentation was read instead. No third-party product was installed, connected to Budgit, or given financial data.

## Historical cleanup checkpoint — 2026-11-06

Superseded for publication status by the guided-review release above, for indefinite original retention by the accepted 2026-11-07 amendment, and for local deletion eligibility by the 2026-11-08 verified-upload amendment. The following records the earlier local test boundary.

The local draft now records full-group completion witnesses in encrypted source metadata in the existing atomic financial transaction. Token receipts recheck current authorization, exact source/connection, every group member and financial evidence. The generated workflow retains by default; explicit `delete-after-saved` opts into a fresh receipt, exact hash recheck and native confirmed deletion. Service tests cover actual original parser/review/group saves and rollback. Native QA is already added; a supported CLI run of the listed `Budgit-Incoming-QA` copy timed out with zero requests. Native folder/delete permissions and physical iPhone scheduled/locked runs remain unaccepted. No production sync or later-phase policy was enabled.
