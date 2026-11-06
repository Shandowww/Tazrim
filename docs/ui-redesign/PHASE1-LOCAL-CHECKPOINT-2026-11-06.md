# Phase 1 local checkpoint — 2026-11-06

This is an implementation checkpoint, not a release or Phase 1 acceptance. Production remains the category-management application `0b830c5`. Phase 2/3 are disabled. No live budget, provider, Sites audience or hosting resource was changed.

## Implemented

The incoming inbox belongs to the signed-in user, independently of the selected budget. Upload connections can deliver files and check only their own receipts. Sources use the original encrypted report store and quotas. Delivery is atomic with the connection receipt and success marker; failure does not leave an unacknowledged source consuming quota. Revoking a connection or changing the account while a body streams prevents its later write.

The user approves the exact source hash/revision before the on-device reader runs. Existing readers, inbox models, review/group draft format and financial save commands remain in use. Confirmed identifier mappings are reused. New card matches require issuer plus digits. Bank identifiers include a printed branch when available and reject unknown banks or conflicting identifiers; approved Hapoalim and One Zero PDF extraction is opt-in so legacy inspection metadata remains unchanged. Filename, bank name alone or a sole visible account never selects a destination automatically.

Routing rechecks membership, viewer restrictions, destination revision, account existence and remembered-binding revision. The target source copy and association commit atomically; retries recover the same route. A separate review and explicit existing financial save still follow routing. Locked/unavailable or ambiguous destinations remain explicit.

Private-inbox cleanup requires an exact-reference confirmation. It removes only that staging copy, approval and delivery receipts, preserving routed source files, remembered mappings and financial records. A re-upload after removal needs a fresh parsing approval. A full destination or any failed cleanup preserves the prior usable state.

Original-workflow full-import evidence can report completion through connection-local receipts, requiring retained group sources and current financial receipts. Partial/activity/ambiguous/skipped/changed/missing groups do not qualify. The generated workflow retains originals by default. The inherited optional `delete-after-saved` mode requires explicit device setup, a fresh full-import receipt, exact current-byte verification and native deletion confirmation. That mode remains unverified and has not been enabled in the QA run; no real file has been deleted. Safe movement to Uploaded remains separate from this optional mode.

Inbox consent, approvals, mappings, deliveries and connection changes participate in the existing changed-data backup tracking. Operational retry timestamps do not trigger backup work by themselves. No additional service or automatic financial processor is added.

## Verification and limits

The isolated combined source snapshot passed build/typecheck, 1,268 application/reader tests and 15 core checks with retention as the default; the focused Shortcut suite also passes after the QA-name/runner refinements. Final checkpoint: root build/typecheck, all 1,268 application and reader tests, 15 core checks and `git diff --check` pass. Subsequent QA-only runner/name refinements are syntax/focused checked; no later application-code change is included in this checkpoint. A broadened test run found a pre-existing Cal UI VM fixture missing the original `statementBatchGroups` dependency; the fixture now supplies the real helper, without product behavior changes. An earlier test pass encountered a transient syntax error while the same working draft was being edited; final snapshot checks avoid that ambiguity.

Earlier bounded browser evidence verifies exact-file approval, explicit first association, lost-response route recovery, the correct scoped review link, automatic reuse on the second report and Bob/Alice isolation with unchanged financial hashes and zero financial writes. It predates the new cleanup controls; fresh phone-width/keyboard/draft/cleanup UI acceptance is not claimed.

The installed Mac `Budgit-Incoming-QA` was invoked only against a disposable loopback service and generated files, with a 25-second limit. It ended with zero requests, sources or budgets. The source files and endpoint were removed on shutdown. Tal's screenshot shows the QA shortcut installed and no visible active run or permission dialog; installation is not delivery evidence. No production installer was published, no real files were moved, and no physical iPhone test passed. A fresh private signed `Budgit-Incoming-QA-v2` revision and loopback-only synthetic receiver have been prepared for an explicit owner import/run; the old receiver had expired. Its result must be recorded separately, and its temporary receiver and credential-bearing files must be removed on completion.

Target device: iPhone 17 Pro, iOS 27, `Downloads/Budgit`. Choose the actual folder through Apple's picker; iCloud Drive versus On My iPhone is not assumed. Run time remains the owner's choice.

## Remaining acceptance

1. Resolve native Folder input/provider access and run the full upload/fault matrix with synthetic files. Prove sequential delivery, strict Boolean/hash/receipt checks and no lost originals under failure. Verify the selected file has not changed when acknowledgement is used.
2. Verify 320/390px, keyboard, unfinished-review/cleanup/connection guards and refresh on the latest UI. Exercise locked destinations, shared-role changes and original encrypted report-storage consent end to end.
3. Deliver a secret-free test installer only through the established native acceptance process. On the actual phone, test manual folder access, duplicate delivery, Hebrew names, changed files, iCloud availability, an actual scheduled run and locked-device behavior. Record actual outcomes, not inferred support.
4. Complete Phase 1 acceptance before Phase 2. Any publication still needs the existing fresh backup, isolated financial/access/decryption/startup/rollback/retained-asset and live preservation gates.
