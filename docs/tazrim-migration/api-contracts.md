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
