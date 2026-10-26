# Daily report Shortcut — developer acceptance work

Updated 19 October 2026. The installable daily Shortcut is **not ready**. Do not run the old `Budgit — דוחות (טיוטת בדיקה)` with real files; its action order is an unfinished schema probe.

## Evidence obtained

- Native Shortcuts export/signing succeeded. Generated workflow signing also succeeded with the existing macOS Shortcuts service; signing needs permission to reach that service outside the shell sandbox.
- Native actions exported and inspected: folder contents, SHA256, Move File with replacement disabled, Repeat with Each, file Name property, equality comparison, URL Encode, raw File request body, Get File from Folder, Get Type.
- An actual native upload probe POSTed generated CSV bytes with a Hebrew filename containing spaces, `&` and `%`, to loopback endpoints backed by the real report store and disposable in-memory identities. It did not read or change a live budget.
- Native output distinguished JSON `stored: true` as **Boolean / Yes** from JSON `stored: "true"` as **Text / true**. Plain truthiness or HTTP success is therefore insufficient. The probe also confirmed dictionary-to-text preserves that JSON distinction.
- The three automated tests of the QA endpoint passed, covering successful intake, receipt lookup and duplicate source identity; rejection of arbitrary files/JSON wrappers, unknown tokens, wrong Host and over-limit bodies; and nine receipt/transport fault modes. These tests validate the endpoint and test cases, **not native file movement**.
- A reproducible draft generator is now in `scripts/build-report-shortcut.py`. Default output has a blank token and folder setup questions. QA mode only permits a loopback endpoint and generated temporary fixture folders, and refuses output into public assets. Three additional tests verify secret-free output, references/nesting, move input selection and rejection of a production URL in QA mode. Six focused tests passed in total.
- A full QA variant was signed and imported successfully after retrying an Apple HTTP 500. Its native run remained on the source `File` action before any HTTP request, including after selecting the same folder in Apple's picker. It was stopped. The disposable endpoint's shutdown report confirmed **requests=0, sources=0, budgets=0, sourceExists=true, movedExists=false**. Folder resolution remains a concrete native-runtime issue; signing/structural tests do not prove the workflow runs.

## Disposable endpoint

After a normal build, run:

```sh
node scripts/report-shortcut-qa.mjs success 5174
```

This binds **127.0.0.1 only**, creates its own temporary `input` and `uploaded` folders, and prints a disposable QA token and exact paths. The token has no production meaning. Only its generated fixture bytes and filenames are accepted. A colliding filename already exists in `uploaded`; it must remain unchanged. No HTTP route can read a budget or arbitrary local file. There is no request forwarding, real Google access or production database. Stop with Ctrl-C; the CLI closes the in-memory database and removes only its own generated temporary folder.

Use a **separate QA copy** of the Shortcut. Put the loopback endpoint and printed QA token in that copy only. Never put the production token into this tool, and never distribute the QA copy. A physical iPhone cannot reach the Mac through `127.0.0.1`; this endpoint is for native Mac acceptance, not a reason to expose it publicly.

Modes, selected at startup: `success`, `missing-stored`, `stored-false`, `stored-string`, `wrong-hash`, `missing-receipt`, `malformed-json`, `unauthorized`, `unavailable`, `disconnect`. The disconnect case stores the synthetic source before dropping the response, so retry deduplication can be checked. Rerun the endpoint to change mode, updating the QA copy's token and paths.

```sh
node --test test/report-shortcut-qa.test.mjs
```

Generate the secret-free development source, without signing or publishing it:

```sh
python3 scripts/build-report-shortcut.py --output /tmp/budgit-reports-draft.wflow
node --test test/report-shortcut-build.test.mjs test/report-shortcut-qa.test.mjs
```

The unsigned draft is deliberately not a download offered by the app. Counter/list actions, locale-independent Boolean checks, regular-file selection, mixed-case extensions, the local size guard, safe movement and setup-question behavior still need complete native validation. The server already rejects unsupported/over-limit sources. The supported-candidate limit is applied after extension selection to avoid unrelated files blocking later reports; only successfully moved files contribute to the success count. These changes after the first full draft run have structural checks, not native acceptance.

## Remaining native acceptance

1. Resolve the native source `File` action's folder-resolution stall; isolate folder representation/access/provider behavior before trusting the full graph. Finish and verify source/destination setup once, blank upload token import question, regular-file selection and bounded per-file iteration. No source directories or tokens may be embedded in the distributed artifact.
2. Verify receipt Boolean type and value without depending on an English device language; a constant JSON Boolean can supply the native comparison type/value. Require a nonempty receipt ID and matching SHA256.
3. Re-read the current source and hash it again after upload, rather than trusting a cached pre-upload reference. Before moving, verify no same-named destination exists and keep replacement off. A changed/missing source or collision must leave the existing files untouched.
4. Run the complete native workflow against the success/duplicate case and every failure mode. Capture source/destination hashes and counts before/after. The fault endpoint alone cannot prove that the Shortcut keeps files safe.
5. Verify cancellation, network loss, source mutation during upload, folders, empty/unsupported/over-limit files, and a collision appearing after the pre-check. A native transfer must not overwrite the racing destination. Bound work without silently treating skipped files as uploaded.
6. Only after passing, sign the secret-free release, verify that no QA token/path/loopback URL remains, and publish it through the established release process. Real iPhone Files access, locked-device behavior and daily automation remain separate device acceptance.

The transient control-tool state mismatch was resolved by rebinding the app. Pickers are closed, the full QA run was stopped, its disposable token was cleared from the native QA copy and it was renamed **Budgit — בדיקת דוחות, לא לשימוש**. Temporary endpoint processes were stopped. No real files moved and no prototype was promoted to a release.
