# One iPhone report folder per user — current readiness

## Assessment

The server intake foundation is implemented. The complete daily iPhone folder workflow is still unfinished and has not passed end-to-end device acceptance. This is a focused follow-up integration project, not a setting that can simply be enabled. A numerical completion percentage would hide the remaining native-runtime uncertainty.

Already implemented:

- Revocable upload connections bound to a signed-in user and a selected budget, with current membership checks on each upload.
- Encrypted source storage, byte-hash duplicate detection, upload receipts and receipt lookup.
- PDF/CSV/XLS/XLSX intake (currently up to 5 MiB per file), stored-source review/resume, supported bank/card parsing and atomic financial import.
- Report/action-center states, manual issuer-notice extraction and explicit final approval of financial changes.

## Remaining milestones

1. **Finish the native folder Shortcut.** A draft generator and single-file native upload probe exist. The last full native run stopped at the source File action before any request. Resolve folder/provider access, then finish sequential upload, exact receipt/hash verification, bounded retries and default local retention, with optional verified cleanup only after a complete durable import. Never overwrite or delete on an uncertain result. Add a usable setup entry in the current interface and a signed, secret-free installer.
2. **Handle one folder containing different budgets.** Current upload connections target one budget, not an arbitrary collection of personal/shared accounts. Mixed-folder intake needs verified bank/card-to-budget mappings or a separate private staging inbox before routing. Ambiguous files require review. Automatic parsing/notice extraction of newly delivered external files also needs orchestration; arrival in the inbox currently does not imply it has been parsed or financially applied.
3. **Prove the actual iPhone workflow.** Choose the folder and per-user connection once, test duplicate delivery, Hebrew filenames, interrupted uploads, changed files, destination collisions, locked-device access and scheduled runs. A Shortcut that signs/imports successfully is not evidence that it works on the phone.

An initial useful result is: download into the folder → a scheduled Shortcut securely delivers new supported files → Budgit shows their received/review state. Fully unattended posting of every report to the final budget is a further policy and implementation step; existing explicit-save and ambiguous-report guards remain in force.

“All reports” cannot currently promise every issuer layout, password-protected document, scanned image or oversized file. Supported files can arrive automatically; unsupported formats must remain visible as exceptions.

## iPhone scheduling

Apple's current iOS 27 guide documents automation triggers such as Time of Day and App, and enabling eligible automations to run without confirmation. It does not list a generic Files-folder-added trigger. Plan for a scheduled sweep and an optional manual Run action, not an instant upload whenever a file is downloaded. File-provider access and locked-device behavior still need device verification; the Budgit web page is not a reliable background folder watcher.

Official references checked 2026-11-05:

- https://support.apple.com/guide/shortcuts/intro-to-automation-shortcuts-apd690170742/ios
- https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios

## Code and prior evidence

- `server/report-store.mjs`: upload connections, receiver, receipts, storage and deduplication.
- `scripts/build-report-shortcut.py`: unfinished native folder workflow generator.
- `scripts/report-shortcut-qa.mjs` and corresponding tests: disposable upload/fault endpoint.
- `docs/REPORT-SHORTCUT-QA.md`: actual native results, folder-resolution failure and remaining acceptance.
- `docs/ACTION-CENTER-AND-AUTOMATIC-IMPORT-PLAN-2026-10-18.md`: original folder, receipt, privacy and explicit-save contract.

This assessment creates no user tokens or automations and changes no files on the iPhone.


## Confirmed device-test target — 2026-11-06

Tal selected `Downloads/Budgit` on an iPhone 17 Pro running iOS 27. Select this folder using the native Files picker; its iCloud Drive versus On My iPhone provider is not yet confirmed. No daily run time has been selected. This records the intended test setup only: installation, folder permission, synthetic delivery, scheduling and locked-device behavior remain unverified. Originals must remain in place during initial acceptance.

## Current continuation — 2026-11-06

The private incoming inbox, exact-source approval and identifier routing now have synthetic browser acceptance at 320/390/1440px, actor isolation and unchanged financial data. The generator uses a Folder passed by an Apple automation, with a share-sheet Files-input alternative; it does not embed a static folder bookmark. The user has already added the native QA Shortcut. Do not ask them to add it again.

Optional local cleanup is now a source draft. Default `retain` keeps every local original. Explicitly changing the second Text action to `delete-after-saved` enables a fresh connection-local receipt check on subsequent sweeps, followed by another hash check and the native Delete File action with confirmation enabled. Uploading, parsing, routing or saving a partial report never authorizes cleanup. Full import requires atomic completion evidence for every stored group member, current financial receipts and preserved readable original bytes. Cal activity exports remain ineligible because their current receipts prove only selected cycles. Locked vaults and missing/revoked access remain ineligible. Budgit's stored original is retained.

Native execution is **not accepted**: the supported CLI listed the imported copy as `Budgit-Incoming-QA`; running that copy with only generated synthetic Folder input timed out after 25 seconds with no output and zero endpoint requests. The endpoint and child were stopped; no user file was touched. Do not infer Files permissions, case-action compatibility, delete authorization, scheduling or locked-device behavior from structural/service tests. There is no assumed immediate callback to iOS. The updated cleanup workflow has not completed a native run or been distributed as a production installer.
