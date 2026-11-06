# Native Shortcut execution investigation — 2026-11-06

This is local synthetic QA, not publication or native acceptance. Production remains `0b830c5`. No real reports, budgets, provider access or macOS security settings were used or changed.

## Observed blocker

The supported macOS unified log identifies the earlier CLI run at 08:42:00–08:42:25 local time. `BackgroundShortcutRunner` completed the first Text, input conditions and Comment actions. It started `is.workflow.actions.downloadurl` at 08:42:00.490. At 08:42:00.502, `siriactionsd` logged `Content destination … requires first run approval, will prompt for special request`, followed by no saved smart-prompt state. The URL action ended with cancellation (`NSCocoaErrorDomain 3072`) when the CLI was terminated at 08:42:25.

This locates the observed wait at first-run web permission before folder enumeration. It does not prove that Folder input, extension conversion, Boolean typing or deletion works. It does not establish the old embedded endpoint/token is current. The installed copy is listed as `Budgit-Incoming-QA`; `shortcuts view Budgit-Incoming-QA` opens its native editor. No denied Shortcuts library was read and no UI scripting was used.

The later v2 run at 09:04:56 completed with code 0, but sent zero requests to this task's endpoint. A second native QA process was listening on another port under the same v2 name. Its installed graph had 207 actions and reached folder enumeration and Change Case, then skipped every file. This is not accepted delivery evidence for this session.

Apple's installed action definition at `/System/Library/PrivateFrameworks/ActionKit.framework/Versions/A/Resources/Base.lproj/Actions.intentdefinition` defines `ChangeCase` with parameters `text` and `type`, whose supported enum includes `lowercase`. The generator previously used `WFInput` and `WFCaseType`. It now writes `text=<extension>` and `type=lowercase`. This identifies a concrete schema mismatch; the corrected graph still needs a matching-session native run. No URL/token values were extracted from the installed Shortcut.

## Current source changes

The optional `delete-after-saved` graph is restored with `retain` as its default. Cleanup resolves the folder contents again after a fresh connection-owned receipt, requires one exact-name match, hashes the fresh File item, and deletes only that item with native confirmation. Rehashing the pre-upload File object could reuse cached bytes and is insufficient. Share-sheet inputs have no Delete action because they cannot re-enumerate the original folder. Activity/partial/legacy imports remain ineligible at the service.

`scripts/incoming-shortcut-native-qa.mjs` creates a private, disposable 20-minute loopback session and signs a separate `Budgit-Incoming-QA-<port>` artifact with a session-specific native name. This prevents a same-name installed Shortcut from silently targeting another synthetic session. Config/token/unsigned files are removed after signing; all generated files and the in-memory database are removed on close/expiry. Signing failure also cleans up. The HTTP sink accepts only generated filenames and exact synthetic statement bytes. It counts total arrivals and authentication failures separately from accepted requests, without logging credentials.

`scripts/incoming-shortcut-qa.mjs` now uses the real isolated app. Its explicit `completeSavedImport()` method approves, routes, parses, reviews, saves a draft and commits through the existing original orchestration. It verifies a genuine cleanup-eligible receipt; it never fabricates the completion flags. Both encrypted source copies remain stored. Fault modes remain synthetic transport responses. Ordinary upload tests create no budget.

## Supported next action

From this checkout run `node scripts/incoming-shortcut-native-qa.mjs` in an interactive terminal. Open the signed path printed by that session, import the uniquely named QA revision printed by that session, and leave its second Text action at `retain`. Type `run` in the terminal. Approve only the visible native request for the printed `127.0.0.1` endpoint and generated fixture folder. Do not change macOS security settings. If no dialog is visible, inspect the native editor's active action and the supported unified log; do not infer a folder failure from a timeout.

After a successful run, type `status`, then `run` again: the second run should fetch the catalog without another upload. Native success requires observed completion and request/source counts, not installation alone. Use a fresh session for each upload-fault case so its catalog is empty. Every fault must retain the fixture. After successful delivery, `import` performs the real isolated financial save. Only a newly generated artifact containing the fresh-folder cleanup graph may then be opted into `delete-after-saved`; the earlier pending upload-only acceptance artifact must stay at `retain`. Confirm native deletion only for these generated fixtures and verify the stored originals remain. Type `close` when finished; the session also expires automatically.

The earlier v2 session was closed and its generated artifacts were removed. Existing v2 copies must not be reused for acceptance: they predate the fresh-folder graph/schema repair and may target another expired endpoint. No native run of the current cleanup graph has passed.

## Quota, privacy and rollback review

- Existing limits remain: 5 MB per file, 500 sources per scope, 20 MiB per scope and 20 MiB globally. Routing retains both private staging and the destination original, so a new destination copy consumes additional quota. A failed route rolls back; the approved private original remains downloadable. No paid-resource change is proposed.
- Private staging deletion frees that copy and removes its approval/delivery witnesses, preserving the destination original and financial evidence. A retained local file can be delivered again and needs fresh approval. Connection receipts are scoped to their own deliveries and expose no financial amounts.
- Inbox consent explicitly distinguishes server-readable encrypted reports from a locked budget vault. Full cleanup receipts require current authorized writable destination access and an unlocked plan. Neither a delivery receipt nor a parsing approval enables Phase 2/3.
- The five intake tables participate in existing changed-data backup tracking; operational request timestamps do not trigger backups. Encrypted database backup includes those tables and both source copies. Their actual backup/restore, startup on the previous image, financial/access/decryption and retained-asset compatibility remain release gates. Rollback must preserve the expanded database and keys; dropping intake tables would lose approvals/receipts and is not an ordinary rollback.
- The existing 100-requests/hour connection limit also counts catalog/cleanup reads. A very large opted-in sweep may stop at that limit and retains remaining files. A production installer must expose this bounded retry behavior accurately; no complete/unattended sweep is claimed.

## Verification

`work/ui-redesign/native-qa-focused.log`: 17 focused tests pass, including actual isolated import completion, duplicate identity, retained generated bytes, stale-auth request accounting, strict group proof and share-sheet retention. Root build/typecheck and 15 core checks pass (`native-qa-build.log`, `native-qa-core.log`). The exact final combined suite passed 1,270 tests after the native action-parameter correction (`native-qa-final-tests.log`); the 17 focused tests also passed. Prior browser evidence remains bounded to its recorded source; no new native, iPhone, scheduled/locked or latest cleanup-browser acceptance is claimed here.


## Folder-first setup follow-up

At Tal’s request, the generated folder Shortcut now starts with three labelled setup sections: native File/folder selection, upload key, and retention (`retain` by default). All setup precedes validation and network requests. Import questions reference the actual folder/key action indexes. Folder workflows no longer advertise Shortcut Input; their chosen native folder supplies both enumeration and the existing fresh-file cleanup recheck. Share-sheet workflows retain external input and have no deletion path. Native QA requires selecting its printed generated fixture folder in the first File action.

The signed secret-free setup artifact is `outputs/shortcut-setup/Budgit-Folder-Setup.shortcut` in the outer project. It has no upload credential or local endpoint. This is setup review only: the incoming API is not published, and actual iPhone folder selection/run acceptance is still pending. No installed Shortcut, real file, production service or financial record was changed.

## Two files skipped on manual Mac run — follow-up

Tal's screenshot shows `Budgit-Folder-Setup` reporting zero new uploads with an XLSX and PDF visible. Supported native lifecycle logs for the 14:54:26–14:54:27 run show successful catalog retrieval, folder enumeration, two file iterations/property reads/Change Case, and no hash or upload action. This proves this Mac run reached the folder and skipped both items before upload. Private log values remained redacted; no installed credential or report content was read. The exact unexpected extension/converted value is not visible, so the failing normalization boundary is not claimed as a proven root cause.

The revised graph compares native file extensions directly (lower/uppercase and dotted forms) without Change Case. Completion now distinguishes examined, supported, skipped and newly delivered counts, and emits skipped names/extensions for further device diagnosis. It retains originals and has no production deletion/move action. A signed replacement is available at outer `outputs/shortcut-setup/Budgit-Incoming-Filter.shortcut`; import it as `Budgit — סנכרון תיקייה`, select the same folder and paste the existing key locally. Native success for this revision remains pending owner import/run. Source checks cannot replace that acceptance. This follow-up is not a new production deployment.

## Upload rejection and native notification wait — follow-up

The owner's next run reached upload. Supported native logs show the URL action completed at 15:00:24 local, then the failed receipt guard entered a notification action awaiting first-run notification approval. It was not spending that minute parsing or importing. Server read-only operational checks showed one active connection with an upload error, zero incoming sources/delivery rows and no successful upload. Its safe error was: choose a supported report up to 5 MB with a valid filename. No token/report contents were accessed. This message combines empty/oversize payload and filename validation, so the rejected component is not yet established.

The next signed local candidate explicitly rebuilds the upload name from the provider's name stem and native extension, encodes it in Encode mode, and displays safe server errors before receipt-type checks. Existing type/hash/receipt validation and retained originals remain. Twenty-one focused tests and graph reference checks pass. Local native acceptance remains pending; no new production deployment is claimed. Artifact: outer outputs/shortcut-setup/Budgit-Incoming-Transfer.shortcut.


## Native missing comparison parameter — replacement candidate

The owner's next run stopped at “If Dictionary Value is [empty]”. Supported native logs for 15:08:28 show filename normalization and hashing completed, followed by the prior-receipt branch; no upload action ran. The earlier assumption that the screenshot was simply an owner-editable missing Hash value was insufficient. The native editor did not expose the generated comparison as intended. Private values and installed workflow storage were not read.

Every generated equality now materializes its left input with an explicit Text action before using the Text comparison parameter, including Dictionary Value hashes and Type results. Dynamic right operands remain populated action-output token strings. Catalog presence now uses the prior receipt ID materialized as Text rather than the dictionary container. Boolean type/value, receipt ID and exact source-hash guards remain; originals are retained. A graph regression checks these native parameter boundaries and retained dynamic receipt guards. These checks and signing do not establish native execution success; owner import/run remains required.

Validation: 22 focused graph/service/routing tests pass; build/typecheck and signing pass. Fresh signed local artifact: outer `outputs/shortcut-setup/Budgit-Incoming-Text-Checks.shortcut`. Choose the folder and paste the existing upload key at the top; do not manually edit conditions. The published installer/application remains `46ab406`; this local replacement has not been deployed.


## Empty native Text incorrectly treated as a receipt — confirmed follow-up

The Text-Checks owner run displayed “previous receipt is invalid”. The supported 15:47:46 native log establishes the exact boundary: hash lookup returned zero items, receiptId lookup returned zero items, Text then returned one item, and the condition chose the prior-receipt branch. The subsequent missing stored lookup/Get Type also returned zero. Thus materializing an empty lookup as Text did not make a native content-presence condition safe. This is direct native evidence, not inferred from the notification alone.

Read-only server aggregates show one incoming source and one delivery, with last successful upload at `2026-11-06T13:08:10.321Z` and no current upload error. No filenames, report contents, keys or account identifiers were read. The owner removed the PDF and reran: the completion screenshot shows one examined/supported file, zero skipped, zero newly uploaded. This confirms the retained spreadsheet's old receipt passed type/value/hash checks; it does not establish PDF upload or financial import.

The new graph measures Text character count and compares it explicitly to zero for missing receipt IDs, required setup/receipt values, and absent server errors. It no longer uses Has/Does Not Have Any Value conditions. Strict Boolean type/value and hash validation remain. Production still has no deletion/move action. Signed local replacement: outer `outputs/shortcut-setup/Budgit-Incoming-Receipt-Fix.shortcut`; choose the same folder/key and restore the PDF before an owner run. The existing spreadsheet should be skipped through its validated receipt. Native PDF delivery remains pending; this is not a deployment.

Validation: 22 focused graph/service/routing tests, build/typecheck and signing pass. Graph contract covers the explicit Characters count and absence of native content-presence conditions. These checks do not replace native PDF delivery acceptance.


## False missing-key message: native Count input key — 2026-11-06

Owner entered the upload key during import but Receipt-Fix stopped at the missing-key notification. Native logs at 15:54–15:55 show Text/Count/condition/notification and exit before any network action. Private values remain redacted; the notification does not establish the key was absent.

A local diagnostic now loads shipped WorkflowKit/ActionKit action definitions through the toolKit registry, without opening installed workflows/storage or running any network/file action. Native Count declares `Input`, not `WFInput`; the generator incorrectly used `WFInput` for every Count. Native folder enumeration also declares `Recursive`, not `WFGetFolderContentsRecursive` (default false had retained non-recursive behavior). All generated occurrences are corrected. Folder/input presence counts file items directly rather than coercing a directory to Text. Other non-conditional action parameter names pass against the shipped definitions. The legacy single-condition representation remains separately covered by owner execution, not this parameter-name check.

New diagnostic `scripts/check-incoming-shortcut-native-schema.swift` rejects the previous secret-free Receipt-Fix workflow at Count's unknown `WFInput` parameter. The regenerated workflow passes 172 non-conditional action schema checks. Direct native Count primitive checks yield 0 for an empty synthetic string, 43 for a synthetic token-shaped string and 36 for a synthetic identifier. No real key, report contents or installed Shortcut data was accessed. The preceding source-only graph tests missed this native schema mismatch; the native metadata check is an additional independent boundary, not proof of complete workflow execution. Earlier numeric completion counters are not reliable acceptance evidence because they used the wrong Count input parameter; successful receipt validation and server aggregate delivery evidence remain valid within their documented limits.

Signed local replacement: outer `outputs/shortcut-setup/Budgit-Incoming-Native-Inputs.shortcut`, with the same top folder/key setup. 23 focused tests, native schema/synthetic-count checks, build/typecheck and signing pass. Owner native workflow run/PDF delivery remains pending. No production deployment, financial edit or original-file deletion was performed.
