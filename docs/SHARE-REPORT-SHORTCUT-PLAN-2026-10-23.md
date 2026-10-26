# Share reports to Budgit — implementation plan

Date: 23 October 2026. Status: planned; no Shortcut implemented, model switched or release published by this plan.

## Security prerequisite added 23 October

Follow [the cross-app infrastructure security and maintenance plan](INFRA-SECURITY-AND-UPDATES-2026-10-23.md). Patch and verify Budgit's vulnerable live Node runtime before publishing the Share Shortcut. Address Parking's affected runtime as urgent shared-server maintenance; coordinate backups, rollback and service checks. Shortcut development with synthetic local data can proceed independently. Plant Care/HA findings and ongoing automation work are tracked in that companion plan, with separate runtime-verification gates. Astra High is recommended for the initial cross-app remediation; routine recurring checks should use scanners and lighter model assistance as needed.

Security execution update, 24 October: Budgit and Parking now run Node 24.22.1 with verified health/access checks; the shared proxy is rebuilt with Go 1.26.10. The live Node prerequisite is complete. Home Assistant installation and host maintenance remain tracked separately.

## Outcome

On iPhone: open a report in another app → Share → **שליחה ל־Budgit** → receive a verified upload confirmation → review the stored report in Budgit. No manual Save to Files step. Uploading never applies financial changes automatically. Temporary files managed by iOS may still exist.

This is a Share Sheet Shortcut action, not a native app extension or a PWA share target. The source app must supply file bytes; a bank login URL is not a report. PDF/CSV/XLS/XLSX storage does not guarantee that every issuer's format can be parsed.

## Selected execution model

Use **GPT-6 Astra (`gpt-6-astra`), High reasoning**, with one implementation agent. This is a quality-first judgment for a bounded task involving undocumented native action serialization, credential handling, transport failures and financial-data boundaries. It is not a measured model benchmark. GPT-6.1 Sol is a reasonable lower-cost alternative, but Astra is the selected executor.

Official guidance recommends Astra for complex reasoning/coding and High for complex debugging and agentic work:
- https://developers.openai.com/api/docs/guides/code-generation
- https://developers.openai.com/api/docs/guides/reasoning

Tailor execution to this model by supplying the complete outcome and invariants, then letting it choose implementation details. Use short evidence checkpoints rather than one large unverified generated workflow. Stay on High; more reasoning cannot substitute for native testing. Keep an evidence log of observed behavior, assumptions, changed files, tests and remaining device checks. No parallel agents are needed because the native Shortcuts environment is shared and the phases depend on each other.

The model is used to build the feature only. No AI service or model call belongs in the report-upload path.

## Existing foundation and scope

Read AGENTS.md, README.md, PROJECT-HANDOFF.md and APP-GUIDELINES.md before implementation. Recheck current source and working-tree changes; this plan is a dated snapshot.

- `server/report-store.mjs`: existing token-bound receiver, encrypted source storage, receipts and hash-based deduplication.
- `server/app.mjs`: `/api/imports/reports` receiver route.
- `src/stored-reports-client.js`: connections, report queue and resume workflow.
- `scripts/build-report-shortcut.py`: unfinished folder-based workflow with useful native action schemas.
- `scripts/report-shortcut-qa.mjs` and corresponding tests: synthetic endpoint and fault cases.
- `docs/REPORT-SHORTCUT-QA.md`: native evidence and known limitations.

Create a separate Share-input generator/artifact. Reuse verified helpers where useful; do not carry over folder scanning, file moving, daily scheduling or folder setup. Preserve the existing Apple Pay integration and folder prototype. Leave unrelated parser work, handoff edits and the pre-existing deleted Apple Pay installer untouched. If that deletion blocks building, use an isolated validation copy with the tracked installer restored there, documenting the difference.

## Phase 1 — prove one shared file works

1. Inspect/export a minimal native Shortcut with Show in Share Sheet and File input. Verify the serialized input types and actual Shortcut Input reference; do not invent Apple action identifiers or assume macOS behavior proves iPhone behavior.
2. Create the smallest development workflow: receive one file, inspect name/size, compute SHA-256, upload its raw bytes, inspect the receipt. Use synthetic files and the existing disposable endpoint.
3. Test Hebrew names, spaces, `&`, `%`, mixed-case extensions and byte preservation. Ensure the body is the file, not its name, path, text conversion or a JSON wrapper.
4. Record a successful native execution and exact receipt/hash match before adding setup UI or batch processing. Signing or a structurally valid plist is not execution evidence.

Gate: one actual native file input produces the same stored bytes and a verified receipt. A native failure should be reduced to a minimal probe before growing the workflow.

## Phase 2 — complete the Shortcut contract

Release name: **שליחה ל־Budgit**. Initial version accepts one or several files, maximum ten per invocation, uploaded sequentially. Prove single-file behavior first. Reject an over-limit selection before uploading rather than silently dropping files.

1. Accept files from Shortcut Input. An empty/manual launch explains how to use Share; do not require a folder picker. Reject web pages, URL-only input, folders and unsupported content with an actionable Hebrew message. Do not fetch arbitrary shared URLs or issuer login pages.
2. Validate each filename, extension, nonempty content and the receiver's current size limit (currently 5 MiB). Keep current server quotas; do not enlarge storage or add cleanup as part of this work. Unsupported/oversized files are reported explicitly and excluded from success counts.
3. Use a separate revocable upload connection bound to the selected account/budget. Install a secret-free signed template; the user enters the token once during setup. Keep the destination HTTPS host fixed. Put credentials only in the Authorization header, never in URLs, logs, distributable artifacts or screenshots. Explain that a configured Shortcut contains a credential and must not be shared; do not claim Keychain protection for a Text action or assume it never syncs through iCloud.
4. Send raw bytes to `POST https://budgit.duckdns.org/api/imports/reports?name=<encoded filename>` with `Content-Type: application/octet-stream` and Bearer authorization.
5. Count success only when `stored` is Boolean true, `receiptId` is nonempty and `sourceHash` matches the locally calculated SHA-256. Verify the Boolean check in Hebrew and English. HTTP success or the string `"true"` is insufficient.
6. Handle existing receipts accurately: pending duplicates remain pending, committed duplicates are already processed, archived duplicates remain archived. Do not reset review choices or silently reactivate an archived report. Never say every duplicate is awaiting review.
7. On a transport error or invalid receipt, stop further uploads and identify the unconfirmed file and any remaining files. A disconnect after server storage is an uncertain result, not proof nothing was stored. Tell the user to check Report Center or re-share; the server's same-budget hash deduplication makes a repeat upload safe. Do not add unattended retry loops or promise an offline queue.
8. Show a Hebrew summary of confirmed uploads/already-stored reports and explicit failures or unattempted files. Say **הדוח נשמר ב־Budgit; טרם הוחל בתקציב** only for the relevant pending state. Never equate stored with independently backed up.

No Save File, Move File, Delete File, automatic budget commit or source cleanup action is included. Do not claim a failed share remains recoverable inside the Shortcut after it closes; it may need to be shared again from the source app.

## Phase 3 — installation and review entry

Add a small installation/setup entry to the existing Report Center connections area. Identify the target budget clearly; allow a dedicated connection to be created and revoked through existing authenticated controls. Preserve explicit consent for server-readable report storage when the budget vault is encrypted.

Provide a signed secret-free installer, one-time token setup instructions and a short explanation of supported files. A replacement/revoked connection should lead directly to the existing setup controls.

After upload, offer to open Budgit for review. First inspect existing navigation support. Reuse a suitable route or add a small authenticated Report Center entry route if necessary. No token in that URL; a report identifier is never authorization. Preserve drafts, current edits and budget membership checks; do not silently switch budgets with unsaved work. A wrong active budget should prompt an explicit guarded switch. Expired sessions return to the intended destination after login. Verify actual iPhone opening behavior: a normal HTTPS link may open Safari rather than the installed home-screen window, and that is an acceptable documented fallback.

## Phase 4 — verification

Automated and native verification are separate gates:

| Area | Required evidence |
|---|---|
| Generator/package | Valid references/control flow, proper Share Sheet input, blank credential, fixed production host, no test addresses or local paths, no file deletion/movement actions. |
| Upload | Exact bytes/hash, Hebrew/special-character names, PDF/CSV/XLS/XLSX, empty/over-limit/unsupported inputs and multi-file selection. |
| Receipts | Missing/false/string `stored`, wrong hash, missing ID, malformed JSON, server errors and disconnect-after-store. All must avoid false success. |
| Isolation | Invalid/revoked token, lost budget membership, encrypted-budget consent, full storage and rate limits. No budget mutation from intake. |
| Repeat shares | Same file twice, same name with different bytes, pending/committed/archived states, partial batch then re-share. |
| Review | Uploaded report appears in the correct scope; resume and existing parsing work; save still requires review and revision checks. |
| Actual iPhone | Share a synthetic report from a document preview and at least one relevant real source app; verify bytes rather than a URL, installation questions, cancellation, network loss, login return and Hebrew feedback. |

Reuse and extend the synthetic harness rather than exposing production data to fault tests. Mac loopback cannot be reached at 127.0.0.1 from an iPhone. For device tests use an authenticated disposable test budget on the established host and synthetic files, or a separately approved reachable test arrangement. Do not expose the unauthenticated loopback harness to the network. Record any temporary test connection and revoke it afterward.

Run focused Shortcut/receiver tests, then required build and verification checks and the full relevant regression suite for changed app/server code. Desktop tests do not certify real issuer sharing. If physical device interaction is unavailable, finish all independent work and deliver an explicitly marked test candidate plus exact user steps; leave device acceptance pending.

## Phase 5 — delivery

Deliver generator source, signed installer without personal credentials, tests, Hebrew installation instructions and evidence notes. Final review checks token leakage, false-success paths, file preservation, permission boundaries and regression scope.

Distribute an explicitly marked candidate for iPhone acceptance first. Promote to a supported installer only after device checks pass. For any app/server deployment, follow the project's existing Budgit process: fresh verified SQLite backup, isolated financial/access preflight, rollback image, same release commit backed up to GitHub, and runtime build/health/unauthenticated checks afterward. Leave Sites unchanged. No new paid resources or services.

Done means a report can be shared without manually saving to Files, its exact original is confirmed in the right server inbox, repeating the share does not duplicate intake, and review/save remains explicit. Publish the actual verification status without implying unsupported report formats, offline support, independent backup completion or native PWA share-target support.

## Execution handoff

Select GPT-6 Astra with High reasoning. Then instruct it:

> Implement docs/SHARE-REPORT-SHORTCUT-PLAN-2026-10-23.md in the canonical Monthly Flow checkout. Follow the project instructions and preserve unrelated work. Start with the native one-file proof, then complete each evidence gate. Use the existing report receiver and review flow. Keep credentials out of generated releases and never automatically apply financial changes. Maintain a concise evidence log and continue all independently testable work before requesting the specific iPhone steps that require me. Clearly distinguish a test candidate from a fully device-verified release.
