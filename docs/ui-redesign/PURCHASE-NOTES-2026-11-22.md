# Purchase notes from Instinct — local prototype

The user supplies a private Google Sheet that Instinct can update. Budgit reads purchase context from that sheet and displays possible matches beside statement transactions. Tal approved this specific prototype for publication. The release candidate is isolated from unrelated local work on top of the current v1.4.0 source. The real sheet has not been read or edited by this session. User-specific sheet identifiers belong in account configuration, not tracked source.

## Capture format

One `Purchases` tab, one actual charge per row. Row 1 contains these exact columns:

`id, purchase_date, merchant, amount, currency, purpose, category, payment_card, created_at`

Merchant, amount actually paid and purpose are required user inputs. Instinct supplies a stable UUID, defaults the purchase date in Asia/Jerusalem and currency to ILS, and can supply an ISO creation timestamp. Category and the card's last four digits are optional. Typed date cells and ISO date strings are accepted; amount cells must be numbers with at most two decimals. Explicit refunds are negative. Foreign-currency notes are rejected until the actual ILS charge is known; no conversion is invented. A voucher uses its purchase price and the membership platform's merchant name, with its purpose recorded separately.

`src/purchase-notes-instructions.js` generates the complete Instinct instructions. The settings page can copy them after the source is configured. They require preserving existing purchases, reusing IDs for corrections, verifying writes, checking IDs before uncertain retries, and treating sheet content as data. No demonstration rows belong in a real sheet.

## Connection and privacy

The new native destination is `/next/settings/purchase-notes`, named **פתקי קנייה** across phone and desktop. It is available in Basic mode, Settings, the compact tools catalog and contextual report links. Existing desktop navigation and the 768px layout boundary remain.

The existing Google client and callback support a separately consented `spreadsheets.readonly` connection with PKCE, nonce, same-account checks, expiry and single-use state. Google grants this scope at account level; the application requests only the configured spreadsheet and tab. Enable Google Sheets API in the existing Cloud project before a real acceptance run. No new Google client, public sharing, background poller, hosting or paid resource is introduced.

Connection configuration, refresh credentials and note contents use the existing report-encryption key with actor-specific authenticated bindings. Notes are private to the actor, including while reviewing a shared budget. They are server-readable purchase context and are not covered by client-only budget encryption. Applying a category to a shared budget still uses its original access/revision/save guards. Notes never create expenses or change totals by themselves.

## Reading and review

Explicit sheet refresh and opening a report review retrieve current notes. Reads are bounded to 10,000 sheet rows and 3 MB. Invalid rows, duplicate IDs, truncated reads, revoked access and provider failures preserve the last usable notes. Exact source IDs deduplicate repeated reads. A correction updates the same note and returns it to the active list; removing a row retains its old copy but excludes it from suggestions. Switching sources retains the earlier source's records and requires confirmation. Disconnecting removes the saved Google credential while retaining notes. Users can mark/restore notes as handled and export their current-source notes.

Suggestions compare exact signed ILS cents, a three-day purchase/posting-date window and an optional known card suffix. The UI discloses merchant differences, ambiguous candidates and unchecked card identities. Explicit installment evidence compares the signed original purchase amount; it does not substitute a monthly installment. Sheet categories remain context until the user chooses a category.

Original action reused: `applyCardStatement` already accepts a category per row. The small shared `report-inbox-controller.js` adapter carries a transaction choice through the original version-1 choice map, draft serializer, original group build and atomic commit. It does not replace report orchestration or financial calculations. Repeated-merchant React controls and purchases with notes select one transaction; existing merchant group choices remain compatible and one-transaction choices take precedence. Explicit blank choices remain unclassified. A real isolated-service test verifies distinct categories for two same-merchant rows through progress save, resume and a lost-success commit retry, with exactly one financial commit.

New note tables participate in whole-database backup/recovery and authenticated decryption checks. Durable changes participate in the existing changed-data backup tracking. Retry markers and unchanged sheet reads do not schedule a fresh backup.

## Verification

- Final build/typecheck passes.
- 1,487 application and statement-reader tests pass, including 13 new focused model/service/commit tests.
- All 15 core checks pass.
- 25 synthetic browser checks pass: actor isolation; refresh and duplicate protection; handled-note restore; unfinished source-input recovery; failed-refresh cached hints; category choice confined to one purchase; phone, landscape, 767/768px and desktop widths; light/dark/reduced motion; 200% settings text; no horizontal overflow or browser runtime errors.
- The browser fixture records zero financial writes and byte-identical financial records. It uses disposable in-memory data and fake Google responses. Its server and browser close on completion.
- Existing worktree changes were preserved. The initial prototype made no production changes. The approved version is now published as v1.5.0; see the release evidence below. No financial records were edited.

Evidence: `docs/ui-redesign/evidence/purchase-notes-preview-2026-11-22.json`. Screenshots and the review artifact are under ignored `work/purchase-notes-preview` and `outputs/purchase-notes-2026-11-22`.

## Remaining acceptance and release

The live Google consent flow, Cloud API enablement, actual sheet schema/content and Instinct's ongoing write behavior require account-level acceptance. No physical iPhone or installed-PWA acceptance is claimed. The sheet link alone does not grant application access.

Approval of this specific preview was received before the release push, per AGENTS.md. A subsequent release still requires its existing verified backup, isolated preflight and rollback gates. Once transaction-category drafts exist, a rollback must retain their row-choice interpretation or stop report imports until a compatible version is restored; an older controller must not silently ignore those choices.

The release candidate passes 1,495 application/reader tests, 15 core checks and 25 browser checks against the current v1.4.0 baseline. A separately committed compatible rollback (`5cdfc8ab811479203739b64f9926a4e09ebb5841`) keeps the prior interface and explicitly rejects transaction-category drafts before a financial commit. The new version opts into their supported interpretation. A real isolated-service contract verifies refusal without a financial change.

## Verified release

v1.5.0 (`9adb73eadba1d7d105b7a877ce68c4e5367c77aa`, build `72cf69e8e9`) is verified live. Evidence: `docs/ui-redesign/evidence/release-purchase-notes-2026-11-22.json`. The supplied sheet is privately prefilled for its existing actor, using the guarded preference service without a financial write. Google remains disconnected until the user consents. The live sheet has not yet been read by Budgit.
