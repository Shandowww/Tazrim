# Auto-sync continuation — Sol 6.1 Medium — 2026-11-06

> **Mac repair published — 2026-11-08:** `2208e67` adds actionable catalog auth errors, key validation and explicit nested repeat bindings. Native Mac two-file cleanup/refusal/retry and byte read-back passed; same production key works on both devices. Read [the implementation/release note](MAC-SHORTCUT-CATALOG-AND-LOOPS-2026-11-08.md). iPhone revised-binding execution and scheduling/locked-device/provider gates remain distinct.

> **Day-0 cleanup published — 2026-11-08:** `0a5ab68` is live. Manual iPhone upload/deletion without Delete confirmation and exact retained server bytes are accepted on synthetic data; iOS Allow Deleting Without Confirmation was explicitly enabled by Tal. No routine financial application is enabled. Read [release evidence](evidence/release-day0-device-cleanup-2026-11-08.json) and continue only remaining scheduling/locked-device/provider gates. The public installer requires explicit `delete-after-upload`; existing copies keep their configuration. This supersedes local-only/pending notes below.

> **Current next increment — 2026-11-08:** Guided review, lifecycle labels and 30-day server-original retention are published as `63ab8ca`. The public Shortcut retains device files. Tal now prefers **delete the local source during the same run after verified upload**, with a retrievable inbox copy kept until 30 days after full digestion; unfinished reports never expire. Implement [the day-0 amendment](REPORT-GUIDED-REVIEW-AND-RETENTION-2026-11-07.md#day-0-device-cleanup-amendment--2026-11-08), including distinct storage versus full-import receipts, exact current-file checks and native permission testing. This supersedes the historical full-import-before-local-delete rule below. Do not rebuild published guided review/retention. Keep implementation with Sol 6.1; no provider/model switch is authorized by this documentation update.

> **Implementation checkpoint:** the day-0 receipt, opt-in native graph and signed installer candidate are now implemented; read [the local checkpoint](DAY0-DEVICE-CLEANUP-2026-11-08.md). Build/typecheck, 1,322 regressions, 15 core checks and native schema checks pass. Actual native deletion is pending the user’s HTTPS iPhone test, and production remains `63ab8ca`. Continue acceptance and release, preserving the current code.

Execution is active and authorized. Work only in `work/budgit-household-ui` on `codex/budgit-household-ui`; retain all existing uncommitted work. Last committed HEAD at task start: `a542ba74ed21c3abb634caf800fe52eceddbe593`. The sync implementation remains a local draft. Production remains the category release `0b830c5dce2460d21a2e3076f51dba440eb44c99`, image `sha256:2c7fa7e55e042f894f9696f6806c7c5401a592eef652860710dd5cbcf4e8f829`. No production/Sites/real-record operation was performed.

## Agreed workflow

Phase 1 uploads original bytes into the actor-private encrypted inbox, requires exact-source approval before parsing, then routes by actual account/branch or issuer/card digits into the original review/save workflow. Reuse confirmed mappings; never guess by bank name or sole visible account. Phase 2/3 remain disabled and gated by the three-phase plan. Existing parsers, original orchestration, financial commands, CAS, user isolation and vault boundaries remain authoritative.

Tal already added the native QA Shortcut. Do not ask to add it again. Tal additionally authorized **optional local deletion after complete imported-and-saved success**, with retention by default. Upload, parsing, routing and partial cycle import are insufficient.

## Implemented local extension

- `server/report-cleanup.mjs`: strict full-file financial receipt and complete-group validation. Rejects activity exports, skipped/error/ambiguous members, partial bank scope, narrowed date coverage, selected sheets, skipped months, missing or inconsistent group members and invalid current financial evidence.
- `server/report-store.mjs`: records encrypted `localCleanup` completion witnesses in the existing atomic financial/source/commit transaction. All members must qualify together; failed writes roll back. Live checks verify committed member states/revisions, retained/decryptable exact original bytes and current financial receipts. The witness stays internal; no new table or financial import engine is introduced. Existing/legacy imports without this witness remain ineligible.
- `server/report-intake.mjs`: connection-owned receipt/catalog includes `connectionId`, `fullImportComplete` and `cleanupEligible`. Current access, routing approval/hash and destination are rechecked. Receipt ID plus hash queries use AND, not OR; empty queries fail. Token receipts expose no financial amounts or arbitrary budget access. Locked/inaccessible destinations fail closed.
- `scripts/build-incoming-shortcut.py`: Folder input (or `--files-input`), nonrecursive bounded sweeps and duplicate catalog remain. The second Text action defaults to `retain`; explicitly changing it to `delete-after-saved` opts into cleanup. Each later sweep obtains a fresh receipt, verifies stored Boolean/type, receipt ID, connection ID, hash, full-import Boolean and committed/imported states, rehashes the source and invokes native Delete File with confirmation enabled. The stored original is retained. No immediate iOS callback is assumed. The generated action sequence is a draft, not native acceptance.
- `scripts/incoming-shortcut-qa.mjs`: disposable loopback endpoint accepts only generated synthetic filenames and exact bytes; fault modes cover success, missing/false/string stored, wrong hash, missing receipt, malformed JSON, auth/server/disconnect errors. CLI writes a new 0600 config instead of printing its token, and removes it on shutdown.
- `test/report-intake.test.mjs`: actual original reader/controller single/group review/save, failed atomic write, safe retry, current financial receipt removal, reopened sibling, wrong connection/hash, revocation and source-byte retention.
- `test/report-cleanup.test.mjs`, `test/incoming-shortcut.test.mjs`: conservative eligibility boundaries, current card proof, default-retain/delete guards and synthetic transport faults.

Other existing local draft changes (incoming UI/API/routing, pending bell, readers, source cleanup, routing revision/access checks, Drive backup work) must be preserved. Do not reset or indiscriminately stage the checkout.

## Verification and limits

The application suite passed **1,192 tests**, root build/typecheck and **15 core checks**. Logs: `work/ui-redesign/intake-cleanup-app-tests.log`, `intake-cleanup-build.log`, `intake-cleanup-core.log`. Final combined application + parser-tool run after the narrowed-date/selected-sheet checks: **1,268 passed, zero failed**, in `intake-cleanup-final-tests.log`. Build/typecheck and 15 core checks pass. Source hashes and native limits: `evidence/auto-sync-cleanup-local-2026-11-06.json`.

Synthetic headless browser passed exact-file parsing gate, manual mapping/lost-response retry, next-file automatic mapping, pending bell, 320/390/1440 no overflow, unchanged financial hashes and actor isolation: `intake-cleanup-browser.log` / `intake-browser.json`. Browser closed. This is not a physical iPhone test.

An earlier combined run had three `cal-billing.test.mjs` VM billing-UI harness failures. Those tests changed elsewhere in the shared working tree during this task and were preserved. The subsequent parser-tool suite passes all **76 tests**, recorded in `intake-cleanup-parser-tests.log`; the application suite passes separately. The final combined rerun passes 1,268 tests; the earlier failure log is historical.

Native supported CLI listed the imported QA copy as **`Budgit-Incoming-QA`** (not the user-facing Hebrew title). Running it with the generated synthetic Folder input timed out after 25 seconds: no output, zero endpoint requests, zero sources and zero budgets. It was terminated. No user file was uploaded or deleted. The cleanup revision has not completed a native run. Do not bypass the denied Shortcuts library or use UI scripting to infer success. No production installer is distributed. Task-owned endpoint/preview and credential-bearing QA artifacts must be stopped/removed before handback.

## Remaining gates

1. Prove native Folder/provider input, extension case action, receipt JSON typing, fault handling, Files/delete confirmation and exact current-byte reads using synthetic files only. The already-added QA shortcut needs supported native execution, not another request to add it.
2. Physical target supplied earlier: iPhone 17 Pro / iOS 27 / Downloads/Budgit. Actual provider/picker access, manual run, schedule, unavailable iCloud files, changed files and locked-device run remain unaccepted. The Shortcut cannot assume unattended deletion permission; the current draft deliberately asks confirmation.
3. Cal activity/multiple-cycle exports remain retained until whole-file coverage can be proven. No generic “committed” flag authorizes deletion. Other conservative ineligible/legacy cases retain files for manual action.
4. Review quota overhead (private staging plus routed original), privacy/backup and rollback. Private inbox Delete removes only staging/approval/submission; routed source/financial evidence have their own lifecycle. Issuer notices reuse the existing explicit scan; approval does not silently enable later automation policies.
5. Complete coherent source review and checkpoint both approved SSH destinations using the existing independent tracked-source export. Do not commit local configs/tokens/generated QA workflows or unrelated edits.
6. Publication requires exact-source backup, final tests/build/core/browser/native gates, fresh verified SQLite backup, isolated financial/access/HTTP/decryption/startup/rollback/retained-assets gates and runtime hash/health/auth/preservation checks. Five new intake tables make 47 versus production's 42. No hosting upgrade or production financial edit is authorized.


## Continued implementation and owner clarification — 2026-11-06

Tal confirmed that no other session currently owns this work and directed continuation. The original discussion began in the outer canonical checkout; active work remains in the isolated household checkout to preserve unrelated outer work. Native QA is installed according to the supplied screenshot, with no visible run/access prompt. See `PHASE1-LOCAL-CHECKPOINT-2026-11-06.md` for the reviewed private cleanup, branch-sensitive readers, destination witnesses, streaming revocation, backup tracking, completion evidence and remaining native/phone/release gates. Historical statements above about missing full test evidence are superseded only within the explicitly recorded current checkpoint.


## Phase 2 takeover checkpoint — 2026-11-07

The current implementation/validation boundary is [AUTO-PREPARE-LOCAL-CHECKPOINT-2026-11-07.md](AUTO-PREPARE-LOCAL-CHECKPOINT-2026-11-07.md). It supersedes the historical Phase 1-only source/pending lists above. Phase 2 remains disabled in production; the separately published changed-statement repair remains live. Continue remaining acceptance and release gates from that checkpoint without rebuilding completed original workflows.


## Stage 2 capability published — 2026-11-07

Application `beb4f46` is verified live, including the cross-format duplicate repair and current financial-receipt verification. The server capability is available; every budget starts paused until its owner explicitly opts in. No financial application is automatic. Use `evidence/release-stage2-2026-11-07.json` for the exact source/backup/isolated preservation/rollback/runtime gates and remaining plaintext/single-source/device limitations. Historical local-only publication notes above are superseded for this bounded release only. The existing signed Shortcut is unchanged.
