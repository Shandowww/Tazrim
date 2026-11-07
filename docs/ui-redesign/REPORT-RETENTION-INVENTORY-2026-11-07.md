# Guided review: storage and evidence inventory

Implementation follows `REPORT-GUIDED-REVIEW-AND-RETENTION-2026-11-07.md` from `97ad022`. This inventory is not evidence of activation or deletion.

| Storage | Dependency / retention boundary |
| --- | --- |
| `report_sources.source` | Encrypted original bytes, independently copied per private incoming scope and target-budget scope. Keep source IDs/hash attribution as tombstones; purge original ciphertext only through a dedicated retention transition. |
| `report_sources.draft` | Encrypted original version1 group draft, including parsed source rows, source IDs and next-revision witnesses. A live sibling/group may retain copies of another member's parsed data; audit the whole reference closure and block expiry while any member remains incomplete. |
| `report_sources.metadata` | Encrypted filename and existing whole-file cleanup witness. Preserve minimal authorized history/name and completion attribution; retained-original state must disable old local-delete eligibility. |
| `report_intake_approvals` / submissions | Link actor-private staging to target source and token-local receipts. Retain minimal hash/connection ownership to acknowledge removed originals truthfully without exposing budget data. |
| `report_automation_jobs.data` | Encrypted summary and saved-draft hash, not a financial commit. Clear obsolete source-bearing proposals on purge; preserve minimal completion/shadow audit. Automatic preparation alone is New. |
| `statement_notice_scans.data` | Normalized issuer messages only; input page text is not persisted by the existing notice extractor. Keep messages as separate evidence and label removed originals; refuse subsequent source scans/downloads without bytes. |
| `plans` / `budgets`, financial projection | Authoritative normalized finances and source attribution. Never altered by lifecycle refresh or expiry. |
| `report_commits`, `plan_history`, bank import batches | Financial idempotency, encrypted saved-budget history and bank undo use normalized saved snapshots, not raw PDF/Excel bytes. Retain them; removal must not call the destructive source-delete/group-pruning action. |
| Migrations and original correction paths | Source IDs/hash/scope must remain present. Removed originals cannot be re-parsed or downloaded. Migration byte-copy paths must explicitly refuse absent bytes; supported normalized correction and undo remain available. |
| Backups / restore | Old encrypted archives may contain originals until normal backup expiry. Persist completion deadlines and tombstones, reapply expiry before source serving, and support merging newer retention evidence when restoring an older archive. No claim of erasure from historical backups. |
| Native Shortcut | Existing consumers require strict Boolean `stored:true`. A completed/original-removed receipt must use `stored:false`, stable connection/hash/receipt ownership, `cleanupEligible:false`, and a separate validated completion acknowledgment. Update the catalog/acknowledgment graph before enabling expiry; old consumers must retain device originals on rejection. |

The shared lifecycle is New / Partly digested / Digested. Completion requires current durable whole-file evidence and resolved categorization intent. Missing legacy timestamps start a fresh 30-day notice period after validation; visits, scans and duplicate delivery do not renew it. Stage 3 financial application stays absent.
