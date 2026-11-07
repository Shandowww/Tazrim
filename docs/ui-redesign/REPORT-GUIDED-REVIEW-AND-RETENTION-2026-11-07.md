# Guided report review and 30-day retention

Tal's requested amendment, 2026-11-07. **Accepted product plan; not yet implemented by this document.** Implementation remains assigned to Sol 6.1. This extends the three-phase sync plan and reuses the existing parsers, report controller, saved drafts, classification, duplicate handling and atomic financial commands.

## Current baseline and what changes

Stage 2 preparation is published as `beb4f467cbd46ca2aea6aa7665210f57537bcc4c`; exact evidence is [release-stage2-2026-11-07.json](evidence/release-stage2-2026-11-07.json). Owners explicitly opt in per budget. Supported reports with confirmed identities receive encrypted proposals and before/after summaries, then open the original review and financial confirmation. Unsupported, mixed, ambiguous or locked destinations need manual handling. The release passed 1,302 regressions, build/typecheck and 15 core checks; those results do not validate this new design. Physical iPhone scheduling and locked-device behavior remain unverified. Phase 3 automatic application is not enabled.

The next change presents report handling as a guided sequence, adds three clear lifecycle labels, and automatically removes completed reports and their stored original files after 30 days. These capabilities must not be described as already live.

## Stage 2: what the user experiences

After enabling preparation for the selected budget in **סנכרון דוחות**, the user saves reports in their configured folder and runs the existing delivery automation. Budgit prepares supported reports in the background. A new card identifies the file, institution, account/card suffix, personal/shared budget, statement period and arrival time. Uncertain identifiers remain visibly unresolved. Preparation and error messages are secondary details, not extra lifecycle categories.

Tapping **חדש** or **עוכל חלקית** opens or resumes the same guided report flow. Each screen has one purpose, a compact step indicator, Back, **הבא** (Next), and a clear save-progress/leave action. The last screen uses **סיום** (Finish), with text stating that it approves and saves the displayed changes. Next never posts financial changes. Show saving/saved/error states; financial success appears only after the existing atomic save is confirmed. Saved review progress and a saved budget are explicitly different.

| Screen | User sees and decides |
| --- | --- |
| 1. Report and account — הדוח והחשבון | Original preview/download, report period, matched bank/card and personal/shared destination. Known matches are prefilled; unknown or colliding identities require a choice. Correcting a mapping uses the existing explicit confirmation. Phase 1 additionally requires exact-file reading approval here before any parsing. Stage 2 uses the budget's prior preparation consent. |
| 2. Extracted figures — נתוני הדוח | Clear extracted totals, months/cycles and before/after amounts. The user can inspect underlying rows and resolve missing or inconsistent figures through existing controls. Issuer messages are shown separately from financial amounts and remain accessible in the notification center. |
| 3. Transaction categories — סיווג עסקאות | Description, date, signed amount and available evidence precede each category control. Show existing rule/history suggestions; let the user confirm or change them individually or through clearly scoped bulk actions. Preserve existing optional categorization: allow an explicit uncategorized choice, or save progress to finish categorizing later. Never invent a category or turn this into mandatory individual-transaction accounting. |
| 4. Exceptions and conflicts — בדיקות והחלטות | Only applicable questions: duplicate versus corrected statement, installments, transfers, missing account data or other existing review requirements. Show evidence beside the decision. Omit this screen when empty and update the step count; never silently approve replacement or unresolved financial conflicts. |
| 5. Final review — סיכום ואישור | Destination, period, before/after totals, category decisions, duplicates excluded and remaining deferred work. **סיום** applies exactly the reviewed proposal through existing commands. Show a confirmed result and return to the sync center. If only a supported subset can be saved, clearly identify that subset and the remaining work; the report stays partly digested. |

Safe existing no-change duplicate handling may finish without another financial write; label it “already recorded / no new changes” and retain the validated link to the existing import. Do not create a redundant financial approval or duplicate import to fit the wizard.

### Interaction and recovery

- Hebrew RTL, Apple-inspired system type, calm rounded surfaces, compact header, 44px controls, iPhone safe areas, System/Light/Dark and reduced motion. Sticky navigation must not cover rows, validation messages or the keyboard. Announce step changes and focus the new heading; return focus appropriately on Back.
- Preserve decisions across Back, saved-progress exit, reload and re-entry under the exact actor/budget/source. Reopen at the first unfinished step, with completed steps editable. Show accurate progress, such as reviewed rows or handled statement cycles, rather than an invented percentage.
- Protect drafts on account switching, navigation and refresh. A changed source, financial revision, permission or mapping invalidates affected decisions and requires focused review. Preserve compatible choices; do not silently replace them with regenerated suggestions.
- After an uncertain Finish response, recover the same operation's outcome before accepting new edits or reapplying it. Category-only follow-up on imported data uses existing annotation commands; it must never replay the financial import.
- Phase 3 exceptions open directly at the first required decision with access to source evidence and the full review summary. Eligible routine reports require no wizard or Finish press; show their actual completion in the result summary.

## Three lifecycle labels

These are user-facing lifecycle states, separate from internal parsing, queue, permission and error states. **“Digested” in this interface means fully handled and durably recorded**, not merely extracted/prepared. Status must be derived on the server from current durable progress and financial/no-change evidence, not from opening a screen or a client flag.

| Label | Meaning and tap behavior | Automatic removal |
| --- | --- | --- |
| **חדש — New** | No durable user review or applied work yet. Automatic extraction alone leaves it New, with secondary text such as “Preparing” or “Ready for review.” Tap begins the guided flow. A blocked untouched report remains New with an actionable reason. | Never. |
| **עוכל חלקית — Partly digested** | Saved review decisions, completed subsets/cycles, or deliberately deferred categorization remain unfinished. Show whether only review progress was saved or some financial changes were already applied. Tap resumes remaining decisions without reimporting saved portions. | Never. |
| **עוכל — Digested** | All supported report parts/cycles have been accounted for, required decisions resolved and financial changes saved, or exact existing evidence proves a complete no-change duplicate. There is no unresolved/deferred review work. Tap shows a read-only result/history and the original while available. | At least 30 days after complete handling. |

An explicit final choice to leave optional categories uncategorized counts as resolved; “continue categorization later” does not. Reading issuer notifications is separate from financial/report completion. Unknown whole-file coverage, skipped sheets/months, failed imports, activity exports with outstanding cycles, or unverifiable legacy evidence cannot be marked complete. Reopening a required decision removes completion eligibility and cancels its timer. Only renewed full completion starts a new 30-day period; visits, scans and duplicate uploads never reset it.

## Confirmed retention policy

Tal explicitly selected **remove from the sync center AND delete the stored PDF/Excel original**, while retaining imported financial data and history. This supersedes the previous indefinite server-original retention assumption. It is distinct from optional deletion of the local iPhone file by the Shortcut.

1. Persist a server completion timestamp only after whole-file completion is proven. Display the scheduled removal date on every Digested report and keep original download available until removal. The deadline is 30 elapsed days after completion, not arrival, last view or initial parsing. Existing reports without a reliable completion timestamp need validated migration; do not retroactively purge them from an assumed old date. Start a full notice period on verified migration.
2. Run a bounded, idempotent cleanup through the existing maintenance service; no new paid service. Remove eligible reports on the first successful sweep at or after their deadline. Recheck current completion, exact source/version, active review and access constraints immediately before removal. A failed/uncertain operation must be recoverable and visible; never show removal as successful early.
3. Remove the completed sync-center entry and all app-managed original-byte copies for that report, including private staging and routed report-library copies, cached source previews and expired source-bearing proposals/drafts where applicable. Audit reference ownership before deletion: bytes still required by another incomplete report/group cannot be removed. Such a report needs an explicit retention reason rather than a false deletion claim.
4. Preserve normalized imported financial records, categories, source attribution, commit/duplicate identifiers and minimal completion/audit evidence. The ordinary destructive source-delete command must not be reused if it also removes those witnesses, prunes a live group or changes finances. Introduce a dedicated original-retention transition using existing storage transactions. Verify that history, totals, authorized correction and supported undo remain coherent without original bytes. Historical links say the original was removed under the 30-day policy; they do not point to a missing download or promise re-parsing without a new file.
5. Preserve scoped hash/identity completion tombstones after removal so a later folder sweep or cross-format resend cannot resurrect the inbox item or duplicate financial data. A changed file still receives the existing correction/duplicate review. Retention cleanup cannot grant an upload connection financial access or expose another user's report history.
6. Reconcile the Shortcut receipt contract before release: `stored:true` must never describe a deleted original. Distinguish completed-but-original-removed acknowledgments from active stored-file receipts; the catalog must safely skip known completed files without fabricating storage. Default local retention stays unchanged. The optional local-delete graph currently requires a retained original: after server-original removal, do not issue local-delete eligibility under that old contract. Deleting both device and server originals through a different policy needs explicit user-facing behavior and validation, not a silent loosening of receipt checks.
7. Existing encrypted backups may retain historical original bytes until their normal retention expires. Explain that active-app deletion is not immediate erasure from every historical backup; do not silently rewrite backups or promise otherwise. A restored backup must reapply expiry/tombstones before serving originals or re-queuing completed files. Include retention state in backup/restore and rollback gates.

## Implementation sequence for Sol 6.1

1. Define and test the shared lifecycle/completion model, category-defer semantics, completion timestamps and backward-compatible receipt/tombstone contracts. Inventory original-byte references, retained financial evidence and undo dependencies before enabling deletion.
2. Connect the existing single/group review and category actions to the guided screens; retain all current financial/duplicate behavior. Add direct sync-card open/resume and accessible phone navigation. No parallel parser or import engine.
3. Add lifecycle labels, progress, completion result and deletion date. Map existing prepared/imported sources conservatively and preserve existing scopes/permissions.
4. Add and test the dedicated 30-day removal transaction and bounded maintenance, including original-byte purging, receipt catalogs, shared references, privacy, restore and rollback. Enable only once the preservation and native-consumer gates pass.
5. Run representative synthetic bank/card/group, keyboard/theme and physical iPhone checks; publish through existing verified-source/backup/rollback gates. Keep Phase 3 disabled until its independent eligibility/recovery gates pass; then reuse this wizard only for exceptions.

## Acceptance scenarios

- Stage 2 supported report: arrive New, prepare without financial changes, review each relevant screen, correct a category, Finish once, verify totals and Digested status.
- Save after category review, reload, and tap Partly digested: recover exact step/choices and current evidence without duplicate financial application. An explicitly deferred category remains visible after a partial save; subsequent classification does not reimport.
- Unknown account, corrected statement, duplicate, unsupported sheet, activity cycle, mixed/group report and changed totals all expose the correct existing decision; whole duplicates complete with no new financial write.
- Cancel, Back, draft-guarded refresh, stale revision, lost successful response, viewer/read revocation and personal/shared switching preserve isolation and confirmed save semantics.
- Check just before and at the 30-day boundary, failed cleanup/retry, reopened decisions, missing historical timestamps and shared source references. New/Partial reports never expire; only fully complete eligible originals disappear, with unchanged financial records and history.
- After removal, verify no active source download/preview exposes original bytes, catalog reads remain truthful, repeat delivery does not recreate work, and backup restore does not revive expired originals. Test supported correction/undo paths without original bytes.
- Stage 3 eligible reports complete without a user decision; exceptions alone open this guided flow. This acceptance does not imply every report format or locked-device schedule is supported.
