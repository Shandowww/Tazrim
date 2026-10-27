# Budgit contracts used by the React frontend

Derived from `server/app.mjs`, `src/spaces-worker.js`, `src/worker.js`, `server/report-store.mjs` and existing tests at baseline `3c1bc74`. This is a migration reference; the existing handlers remain authoritative.

## Identity and space discovery

`GET /api/budgets` requires the signed-in, allowlisted session. It returns `{ budgets, accountEmail, accountId }`. Each space has `id`, `name`, `role`, `revision`, `scope` and sometimes `hasData`. `personal` is the current user's private plan; other IDs are UUIDs. The caller must choose a space returned by this endpoint before loading its plan. A client-supplied user ID or email has no authority.

`GET /api/plan?budget=<id>` returns `{ plan, revision, accountEmail, accountId }` for the private plan, or the same fields plus `budget` metadata for a shared plan. `plan` can be `null`, plaintext or an encrypted vault envelope. The React display cannot inspect a locked envelope. It must not derive plan values from a stale response after account, budget, vault or route changes. `accountId`/`accountEmail` from the list and plan response must agree.

The new preview at `/next/` uses the same signed-in session as the existing interface. `/ui-assets/` is authenticated; `/api`, OAuth and imports retain their existing routes. No financial data is embedded in the React HTML or static assets.

## Existing write conventions for later tasks

`PUT /api/plan?budget=<id>` receives `{ plan, revision }`, validates financial data or a vault envelope, and applies an exact revision check. A stale revision yields HTTP 409; neither a retry nor a navigation may silently overwrite it. Existing front-end flows save explicitly, and an editor/viewer restriction is enforced by the server. The browser should keep edits and show the conflict until the user resolves it. An invalid plan returns 400; unavailable storage returns 503. Non-read methods must pass the existing same-origin check.

Report intake/review, history, actions, sharing, transfer matching and integrations use separate existing endpoints. Their response and permission shapes must be recorded when each workflow is ported, with tests against the current handler. Do not infer a new write API from Tazrim's Prisma routes.

## Current read-only implementation boundary

The first React screen reads the list and exactly one selected plan, then calls Budgit's pure `tazrimDisplaySnapshot` adapter. Only confirmed reports on or before the current Jerusalem month contribute to dashboard totals. Missing months stay unknown, confirmed zero stays zero, and card charges explain spending rather than adding to it. Budgit's net includes saving deposits and internal transfers; its Tazrim summary tile uses that value explicitly. The selected budget is in the URL and changing it clears the previous screen before the next request completes.

The preview currently does not unlock encrypted budgets, edit plans, import reports, or manage shared spaces. Those are gates for later tasks, not supported behavior of this checkpoint.

## Account-bound manual monthly writes — 2026-10-27

Plan reads now advertise `writeIdentityBound:true` in this source. Optional `accountId` on PUT must equal the authenticated actor; absent fields remain compatible with existing callers. The React monthly command requires the capability, rechecks permitted spaces/identity/current snapshot before saving, and sends the original revision plus actor. Conflict never triggers a force-save. An explicit retry can acknowledge an exact already-saved successor snapshot without another PUT; uncertain responses retain the draft. New-server capability is required; this is not a claim that the current production server supports it. Canonical backend change is independently backed up as `54362e5`.

The first React write route `/next/monthly` supports saved plaintext manual budgets without configured cash accounts, bank imports or the selected month's report/statement anchors. It uses existing `saveMonthReport`, validation and installment inclusion flags. Other scopes, encrypted plans and viewers retain an explicit existing-interface path. Drafts remain memory-only, with explicit download backup. Navigation does not auto-save; Save and Continue is an explicit user action.

## Local monthly draft file recovery

No API is called while creating/reading the recovery data. Metadata includes version, actor, budget, month, baseline revision, normalized snapshot SHA-256 and the raw typed monthly draft. Only the matching clean form can load it; newer data requires manual review. A standard plan payload in the same file is never used as a replacement plan by this loader. Ordinary explicit save still rechecks access/identity/capability/revision and validates the prepared monthly plan.

## Shared guarded plan writer and manual account setup

`savePreparedPlan` now owns the existing identity/capability/access/snapshot/revision preflight and actor-bound PUT, with exact successor recovery after an uncertain receipt. Monthly report preparation and manual account preparation call it with a validated next plan. Manual account creation/editing uses the existing `saveCashAccount` pure command; creation is blocked if sole-account fallback assignment would change an existing dependency. It never infers an imported account's source mapping or changes aggregate money. No new server contract was added.
