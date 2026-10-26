# Financial data and recovery

## Pending report and Gmail recovery — 2026-10-18 (local implementation)

The report inbox now archives encrypted originals and decisions in SQLite. This is separate from budget vault encryption: server-readable staging requires explicit owner consent for vault budgets. Historical receipts do not retroactively provide original documents. `report_store_keys` contains the staging key wrapped to the backup RSA recipient; the raw key remains in the data volume as `report-store.key`. Gmail tokens, pending OAuth state and private bank notice text use that staging key. Drive tokens still use their separate key and may require reconnection after recovery.

Recovery verifies source hashes and authenticates report metadata/drafts and Gmail ciphertext. To retain the recovered staging key for a full host rebuild, supply a **new, private** fourth destination:

```
node server/offsite-backup.mjs restore-check archive.backup /safe/recovery-private.pem /new/location/recovered.sqlite /new/location/report-store.key
```

Neither destination is overwritten. Keep the private RSA key outside the server. Install the recovered staging key with private permissions alongside the recovered DB; install the corresponding public recipient and existing deployment/OAuth configuration separately. Changing the RSA recipient requires restarting staging so its key is rewrapped; retain private keys needed by older archives. A dry recovery drill writes the recovered key only inside its temporary private directory and removes it with that directory.

Whole-server archive creation now streams encryption/Base64 to the same v1 format instead of constructing the entire payload in memory. Per-report coverage is taken from the immutable SQLite snapshot and recorded only after verified Drive round-trip delivery. New revisions during upload remain uncovered. `cleanupEligible` stays false; no automatic local or archive deletion is implemented.

See [implementation status](ACTION-CENTER-IMPLEMENTATION-2026-10-18.md) for tests, resource measurements and outstanding browser/device/real-OAuth validation. These changes have not yet been deployed.

## Authoritative data and query model

Budgets remain in `plans.data` / `budgets.data`, with existing revision checks and client-side encryption. The new SQLite read model is additive and rebuildable, not a second independently editable financial ledger. `server/database.mjs` wraps every budget mutation through its DB adapter and projection update in one synchronous SQLite transaction. A projection failure rolls back the budget write. Initial startup backfills unchanged snapshots transactionally and tracks model version/revision. No startup code rewrites source budgets or reassigns transaction identifiers. Direct SQL maintenance bypassing the adapter must call `synchronizeFinancialData` inside its own transaction; normal app saves already do this.

- `financial_scopes`: namespace (`personal:<authenticated user id>` or `budget:<budget id>`), revision, projection version, encryption status.
- `financial_transactions`: scoped original IDs, signed integer cents, event and billing dates kept separate, account/card/category/report references, source and accounting semantics, metadata JSON. Bank entries retain their original key (namespaced `bank:`); card/manual detail IDs are unchanged. A bank reference is optional.
- `financial_entities`: typed scoped accounts, cards, categories, import batches, file receipts, source bindings, rules, goals, savings accounts/state, planned expenses, loans, transfers and billing reports. JSON payloads preserve optional fields without losing queryable core fields. Read-only views expose accounts/cards/categories/reports/goals individually.
- `financial_months`: aggregate and per-account monthly field values in exact integer cents, actual/estimate flag, source metadata. Empty account ID denotes the existing aggregate, **never an extra account**.
- `financial_audit`: change operation, scope/revision, entity ID, timestamp and before/after hashes; no previous financial payload. Starts at migration and does not reconstruct historical edits. It is an audit aid, not a historical restore mechanism.

Indexes cover scope + dates/month/account/card/category/merchant/report. Merchant searches use bounded, parameterized literal substring matching. `GET /api/data/transactions?budget=personal` requires an allowed authenticated session and current budget membership. Supports account, card, category ID, month, source, report, state, from/to (event dates), min/max (signed cents), q, limit (max200), offset. Does not expose arbitrary SQL or sensitive raw payloads. A name search omits bank rows whose original description is unavailable. This API is groundwork; there is no new search UI yet.

**Do not sum the entire transactions table.** Bank movements (`monthly-component`), card breakdown (`included`), separate cheques (`additional`), exclusions and forecasts describe different accounting layers. Card detail purchases are negative cents and refunds positive. Original detail payload amounts keep their existing convention. Monthly totals and account aggregates also must not be added together. Existing forecast functions remain authoritative for forecasts.

Encrypted budgets produce no plaintext read model, and changing to encryption removes current query rows/audit metadata in that transaction. They require future on-device search after unlocking. Previous SQLite pages, old backups and already downloaded copies are not erased by enabling encryption.

Categories currently get deterministic scoped IDs from normalized category paths. Existing category labels and assignments remain unchanged. Renaming/reparenting through a future category-management feature will require an explicit ID/alias mapping, not automatic merchant-based guesses. This migration does not yet convert every form to independent per-entity CRUD.

## Source completeness and capacity

Future bank imports retain decoded date/value date/description/details/beneficiary/purpose/reference/currency/balance with the original entry, under bounded validation. Future Cal detail imports retain notes alongside original cents and due date. Original documents are still **not archived** by this change. A file receipt is a hash, not a copy of the document. Historical bank rows missing source fields are marked `legacy-summary` with a NULL event date, not an invented date. Keep original CSV/Excel/PDF files; recovering missing history needs an explicit reviewed reconciliation path and must not add the movement again.

Limits are still bounded:5000 details,10000 bank entries,1000 bank batches,2000 file receipts,3600 billing snapshots. Import snapshots max2million JSON characters, HTTP body max12MB, API JSON max9million characters, encrypted payload max8million base64 characters. These are safeguards, not infinite retention. Longer histories can later move canonical transaction reads/writes to pagination; this release continues to fetch a whole budget for compatibility. Account isolation, revisions and old backup compatibility are retained. Backup file import now accepts12MB so enlarged exports remain restorable.

## Deployment preflight

Before touching the live DB, run the new image against a consistent backup:

```
node server/preflight-financial-data.mjs /path/to/backup.sqlite
```

It migrates a temporary copy, verifies unchanged source budgets/revisions, compares exact IDs/signed cents/accounting modes to the snapshot, checks integrity/foreign keys and repeated startup. No financial contents are printed. Take a fresh verified backup before restart. A rollback image can read original budget snapshots; the new tables can remain unused. Do not roll back to an old client/server after accepting budgets above its old limits without first providing a compatible reader.

## External backups: implemented building blocks, activation required

`server/backup.mjs` still creates consistent local SQLite snapshots and verifies integrity. A snapshot on the same Hetzner disk does **not** protect against disk loss.

`server/offsite-backup.mjs create` adds a consistent **whole-server** recovery archive, authenticated with AES-256-GCM, with its random data key wrapped using RSA-OAEP/SHA256. Only the public recipient key belongs on Hetzner. The recovery private key stays elsewhere and must have a separately retained recovery copy. This DB dump contains **every user's data, authentication records and integration secrets**; it belongs only to the service administrator, encrypted. It must never be sent to a normal user's Drive as their personal budget backup.

Generate RSA3072+ keys with `node scripts/create-backup-recipient.mjs /safe/new-recovery-directory` on the trusted recovery machine (never on Hetzner); keep the private key outside the synced backup destination. Install only public PEM at `/opt/budgit/data/backup-recipient.pem`, readable by the app container's node user. Set `BACKUP_PUBLIC_KEY_FILE`, `BACKUP_ENCRYPTED_DIR`, optionally `BACKUP_RELEASE`; then run the create command. Temporary plaintext snapshots are removed after normal completion; a forcibly killed process can leave private `.snapshot-*.sqlite` files on the server, which must not be uploaded.

`scripts/pull-offsite-backup.mjs` runs **outside Hetzner** with explicit `BACKUP_SSH_HOST`, `BACKUP_SSH_KEY`, `BACKUP_DESTINATION`. It requests encryption remotely, copies only `.backup`, verifies SHA256 and writes `last-success.json` after a successful copy. Paths can point to an administrator-approved iCloud/Drive synchronized folder; a successful local copy does **not** prove cloud sync finished. No destination, credentials, cloud authorization or recurring schedule is silently installed. These scripts do not currently prune archives; set a tested retention policy after choosing the destination. For unattended execution, surface missed/failed runs and retain daily/weekly/monthly copies rather than one overwrite.

A user-facing Google Drive integration is a separate task: request `drive.appdata` access separately from login, store only that user's permitted budget export, maintain distinct per-user tokens, support revocation, encryption/recovery and restore tests. Google login currently grants identity/email/profile only. Reference: https://developers.google.com/workspace/drive/api/guides/appdata

## Restore drill

```
node server/offsite-backup.mjs restore-check archive.backup /safe/recovery-private.pem /new/location/recovered.sqlite
```

Restores to a **new file only**, authenticates/decrypts the archive, verifies snapshot checksum and SQLite integrity/foreign keys. Tests cover WAL consistency, tampering, wrong keys and refusal to overwrite an existing destination. Keep the app release/source backup, deployment configuration, OAuth credentials and separate budget encryption recovery keys too; a database dump alone does not recreate the server configuration.

Before an actual production restore: stop writes; preserve the current DB and WAL; restore onto a clean isolated instance; migrate/verify; revoke restored login sessions and consider rotation of Wallet tokens, push endpoints and integration credentials to avoid reviving revoked access. Do not print private data. Only switch traffic after verification. Test external download and restoration periodically. **Until a destination and recurring transfer are activated, no offsite protection is claimed.**

## Administrator Google Drive connection

Implemented in `server/drive-backup.mjs` with a separate consent flow from login. An authenticated configured administrator opens Menu → פרטיות וגיבוי → חיבור נפרד ל־Google Drive. Requires the same verified Google email as the signed-in administrator, nonce+PKCE, short-lived hashed state bound to session user and cookie, offline `drive.appdata` consent, and an installed public recovery key. Uses the existing authorized OAuth callback URL; Google Drive API must be enabled in that Google Cloud project. Ordinary login scopes are unchanged.

Refresh tokens are encrypted at rest with AES-GCM using `/app/data/drive-token-key`, outside the DB; scoped to administrator ID. The DB dump contains encrypted token ciphertext, not this key file. After disaster recovery reconnect Drive instead of assuming restored credentials are usable. Do not put the private RSA recovery key on Hetzner or in the same cloud folder as archives.

A manual first backup creates a consistent encrypted SQLite archive and uploads it only to the consenting administrator's hidden appDataFolder, then downloads and SHA256-verifies the uploaded bytes. Last success is recorded only after verification. App settings allow a daily schedule (checked hourly), stopping the schedule, disconnecting credentials, listing latest30 archives and downloading one with integrity verification. Remote archives are never automatically deleted. Disconnection removes local authorization, not already uploaded archives or the Google account's consent entry. Failure status remains visible; no success is inferred from local snapshot creation.

No Drive transfer occurs before separate consent. Scheduled jobs start only after explicit activation. A daily schedule runs on Hetzner, but completed copies live in Google independently; after losing Hetzner, use the same Google OAuth app configuration/account to reconnect and retrieve appDataFolder archives. Preserve OAuth configuration/source and the private recovery key elsewhere. Google describes appDataFolder visibility/access at https://developers.google.com/workspace/drive/api/guides/appdata .

## Conditional end-of-day backups — 2026-10-16

A third mode, `changes-nightly`, runs at the 23:59 civil cutoff in `Asia/Jerusalem`, only when saved data is newer than that connection's last verified backup. New connections default to this mode but automatic execution stays off until enabled; existing daily schedules keep their mode. The UI offers explicit daily/conditional selection and displays pending changes. The service checks once per minute without needing an open browser.

Persistent SQLite triggers advance `backup_data_state.version` in the same transaction as substantive writes to original budgets, sharing/access data, Wallet records/rules/connections and push configuration. No-op snapshot saves, unchanged push schedules, authentication sessions, derived financial indexes, reference-rate refreshes, backup uploads/status and OAuth bookkeeping do not mark financial data dirty. Rollback also rolls back the change counter. `trackTables()` is called again after createApp creates Wallet tables on a first installation. Local unsaved drafts and appearance stored only on a device are not server changes and cannot be in a DB backup.

Each verified manual or automatic backup records a conservative watermark captured before snapshot preparation; a concurrent later edit remains pending. A completed conditional cutoff is stored per connection, preventing a second automatic archive for the same cutoff even if another write happens while uploading. Quiet days advance only this cutoff marker. The first conditional backup establishes a baseline if the old connection had no watermark. Enabling/switching a mode starts at its next cutoff; an already enabled mode retains pending catch-up state. If the server misses 23:59 it catches up on restart, and failed conditional uploads retry after15minutes without clearing pending changes. No claim of successful protection is made before upload and round-trip verification succeed. A scheduled time is the start target; upload completion can be later.

## Local recovery drill receipt — 2026-10-18

After a successful first backup, download an encrypted archive from the administrator's backup panel. On the trusted recovery computer, with the private recovery key stored separately, run from this checkout after building:

```
node server/recovery-drill.mjs /path/to/downloaded.backup /separate/private-key.pem /new/drill-receipt.json
```

The command authenticates/decrypts into a private temporary directory, verifies checksum, SQLite integrity and foreign keys, then runs the current release preflight and in-process application access checks against temporary copies. It checks unchanged authoritative budgets/revisions, transaction identities, signed cents, accounting modes and repeated startup. No network service is started; no Drive credentials are used. Temporary plaintext files are removed before a successful receipt is written. The receipt contains an archive hash, timing and boolean checks, never account names or financial records. Existing receipts are never overwritten. A failure produces no successful receipt. Abrupt process termination can leave temporary plaintext files: use a trusted encrypted local disk and remove abandoned `budgit-recovery-drill-*` / `budgit-migration-*` folders after checking no drill is running.

This is a database compatibility drill, **not** proof of real Google login, encrypted-budget unlocking, full server reconstruction, cloud freshness or recovery time objectives. The in-process exercise covers synthetic OAuth callbacks, anonymous/forged identities, private isolation, denial of restored budgets to new outsiders, shared-membership revocation, account revocation, stale revision conflicts and logout. Real Google login, browser rendering, opening a real encrypted budget and full host reconstruction still require separate verification. Never upload the private key to the live server. The actual Drive backup/download and authenticated database drill were subsequently verified; see RECOVERY-DRILL-2026-10-18.json and RECOVERY-ACCESS-DRILL-2026-10-18.json. This does not close the separate real-login, vault-unlock or full-host reconstruction checks.


## Viewer permission compatibility

Migration0003 adds separate role tables; existing members remain editors when no role row exists. Viewer grants apply to budget loading/search/export, while saves/member management/invitations and Wallet access/import are denied. Downgrading an editor immediately blocks an already-issued Wallet token on its next request. Already downloaded data cannot be revoked. Once viewer roles are used, **do not roll back to server versions before viewer enforcement**: those versions interpret every member as an editor. Fix forward or explicitly remove/review affected memberships before any such rollback. Keep encrypted export/backup readers compatible with optional annotation/analysis metadata before rolling clients back.


## Incremental projection and stable pagination

Projection synchronization now compares every derived column and retains unchanged rows, inside the same authoritative budget transaction. Encrypted scopes still clear current plaintext indexes and audit. Deletions remove only missing derived identities. The original JSON remains untouched by projection. Search clients can send the previous response's `revision` query parameter on subsequent pages; a changed revision returns409 and requires a fresh search. Omitting revision retains backwards compatibility but does not promise stable pages across writes.

Bank balance reconciliation uses a closed month, full-month source coverage and explicit endpoint balances (or an explicitly entered opening balance for that account's first month). It includes all signed bank movements, even excluded transfers/card settlements. Missing source fields/endpoints or an open month produce insufficient-data status, never a manufactured zero or inferred match. It does not add any cash movement to consumption.

## Approved recovery planning objectives and retention — 2026-10-18

Tal approved an RPO planning target of no more than24hours of saved-data loss, and an RTO planning target of restoring service within a few hours. These are planning objectives, not an achieved SLA or measured full-host recovery result. "A few hours" is intentionally not converted into an unapproved exact numeric deadline. The existing conditional nightly Drive schedule targets23:59 Asia/Jerusalem after saved changes; upload failures, authorization expiry and backup freshness can violate the RPO target and must remain visible. Local unsaved drafts are outside server backup coverage.

Tal explicitly chose to retain **all existing and future backup archives for now, with no automatic deletion**, until a separate retention policy is agreed. Do not add pruning of local or Drive archives as a side effect of future work. This decision does not enable another schedule or change storage quotas. Continue monitoring actual backup success and measuring recovery before claiming either objective has been met.


## Analysis metadata compatibility — 2026-10-18

Source allocations, reviewed bank residuals, periodic source links and individual purchase reviews are optional budget metadata. Projection version4 follows explicit category merge targets while preserving authoritative JSON and signed transaction amounts. The private backup JSON remains the source of truth. A direct manual refund may now use a negative amount with an explicit refund marker; do not roll clients back to validators that reject it after such records have been saved. Fix forward or check compatibility on an isolated snapshot, never overwrite newer saved data with an old backup.

## Change journal and recovered HTTP startup — 2026-10-18

`plan_history` stores authenticated actor metadata and bounded, compressed, AES-GCM encrypted before/after snapshots. Vault snapshots retain their client ciphertext; the server receives no vault key. Payloads share the report-store key and recovery wrapper, are included in consistent backups, and are verified during archive restoration. A 4MiB global snapshot quota falls back to actor/field metadata without deleting older history or blocking ordinary saves. No snapshot is retained for invalid/stale financial writes. Journal and report-receipt hooks compose in the authoritative SQLite transaction. Undo creates a new CAS-protected budget revision; only the latest ordinary save is eligible, with no encryption-wrapper changes and no budget-only undo of an atomic report import. The UI refuses broad previews exceeding100 changed values.

`server/recovery-drill.mjs` now also starts the actual HTTP runtime with an ephemeral loopback port against a further disposable copy. It checks health, anonymous denial on private routes and a synthetic authenticated scope. The temporary process and database are removed before success is returned. Application access checks receive the recovered report key and a public recipient derived locally from the already supplied private key, so history-enabled writes work after restoration without the original server key file. Do not mount the private recovery key on the production host.

Standalone access check with report-encrypted rows: `node server/recovery-access-check.mjs <consistent.sqlite> <restored-report-store.key> <recipient-public.pem>`. For live snapshots run in a network-none container and bind only the snapshot/key/public files read-only. `server/recovery-http-check.mjs <consistent.sqlite>` needs loopback sockets, uses synthetic credentials and never replaces the source database. Its receipt is evidence of HTTP runtime reconstruction, not full-host/DNS/TLS recovery or real Google/vault authentication.

Recovery follow-up19October: the real newly generated encrypted archive passed decryption, migration, account-access and actual HTTP-startup checks locally using the previously supplied PEM path. The original key file had flattened PEM lines; `recoveryPrivateKey` reflows a strict complete unencrypted PEM envelope in memory only, without changing the source key. Recovery HTTP uses `BUDGIT_RECOVERY_CHECK=1`, binds127.0.0.1, disables all background timers/startup provider activity and receives only the locally restored report key/public recipient. Receipts now explicitly report source/draft/journal presence; all three were absent in this real archive, so no real pending-source recovery is claimed. See USER-ACTIONS-TO-COMPLETE for the remaining first-use exercise and Google/vault/device steps.
