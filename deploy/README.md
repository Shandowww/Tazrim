# Budgit on the existing parking server

Prepared for `https://budgit.duckdns.org` on server `95.216.213.255` using the existing `park80-caddy-1` proxy and `park80_default` network. Current DNS observed on 2026-10-11 points to `93.172.171.86`, not this server. Change the DuckDNS record to `95.216.213.255` first; inspect IPv6 too and remove any stale AAAA record if this service is not routed there.

## Google setup (owner action)

1. Open Google Cloud Console → choose/create a project → Google Auth Platform.
2. Configure branding and audience for this application. Choose testing audience initially and add the intended users as test users when required by Google.
3. Create an OAuth client of type **Web application**.
4. Authorized JavaScript origin: `https://budgit.duckdns.org`.
5. Authorized redirect URI, exactly: `https://budgit.duckdns.org/auth/google/callback`.
6. Set the client ID and client secret in `/opt/budgit/.env.production`, permissions 600. Do not paste the secret in chat or commit it. The runtime requests only `openid email profile`; no banking, Drive or Gmail access.
7. Set `ALLOWED_GOOGLE_EMAILS` to the initial comma-separated list of approved Google email addresses. Set `ADMIN_GOOGLE_EMAILS` to the owner administrator email in the same server file. The initial list is seeded once into SQLite; future additions/removals use Settings → ניהול גישה לאפליקציה. Administrators remain protected server configuration and cannot be removed in the panel. Without any approved accounts or administrators, access is blocked. Emails are matched case-insensitively only after Google verifies the identity and email. Google’s test-user list is not an access restriction for our basic identity scopes.
8. Recreate only the Budgit service after configuring credentials. Never reuse or alter parking login credentials.

The application validates Google ID tokens with Google's official server library, PKCE, browser-bound state and nonce. Its own seven-day sessions contain only opaque random cookies, stored hashed in SQLite, with Secure/HttpOnly/SameSite=Lax. Each Google subject maps to a stable internal user. The server discards visitor-supplied identity headers before invoking the existing budget API. A changed Google email does not create a new user. An unconfigured login fails closed. Every authenticated request also checks the persisted allowlist. In-app removals immediately revoke the removed account’s sessions. Management endpoints require a protected administrator, same-origin mutations and matching list revision; stale edits fail without overwriting concurrent changes. This does not delete saved budgets.

## Isolated service deployment

Use only the canonical source checkout and exact Git commit. Package source without `.git`, local financial records, node_modules, work, secrets or generated output. Extract into `/opt/budgit`, owned by root. Initialize `data` owned by UID/GID 1000 for the nonroot application. Create `.env.production` from `deploy/env.example` on the server; values are secrets and are never copied back into source.

Run `docker compose -p budgit -f deploy/compose.yaml build` and `docker compose -p budgit -f deploy/compose.yaml up -d`. The service binds no public host port and uses a separate `/opt/budgit/data` SQLite database. Do not run `preview.mjs` in production. Container health reports readiness and whether Google credentials are configured, without secret values. Login-start rate limiting is persisted; all clients through the current proxy share its bucket (30 starts per ten minutes). Introduce trusted proxy IP attribution before broader public rollout rather than trusting arbitrary forwarded headers.

## Existing Caddy proxy

Back up `/opt/park80/Caddyfile` separately, retaining the unchanged parking block. Append `deploy/Caddyfile.fragment`, validate with the running Caddy image, then reload Caddy without recreating the parking application. Check the parking HTTPS endpoint before and after, Budgit's certificate and its login page. The existing proxy already holds ports 80/443; do not start another proxy or expose the budget/database directly. Do not replace parking's Compose file.

## Data, backups and release boundary

No Sites budgets transfer with source. Export each budget, retain encrypted recovery material, log into the new account and explicitly import/save under its new identity. Shared budgets/memberships must be recreated deliberately; private data is never joined by matching email alone. Encrypted personal contexts change between Sites and this runtime; use the app's tested import/rewrapping path, and verify recovery before retiring the old host.

Run `docker compose -p budgit -f deploy/compose.yaml exec -T budgit node server/backup.mjs` for a consistent WAL-aware SQLite snapshot with integrity check and mode 600. A production daily schedule, retention, encrypted off-server copy and restore drill remain to configure before cutover; parking backups do not cover this database. A snapshot includes sessions and user metadata and must stay private. Revoking sessions after restore is recommended.

Production cutover still requires real Google login on the final HTTPS domain, user/share isolation, import/recovery checks, backup restore, and real iPhone Apple Pay validation. Apple Pay endpoints are not yet included in this standalone service. The current Sites version remains the active app until these steps are completed. Avoid publishing subsequent UI changes to both hosts independently; the source remains one Git checkout, and the handoff/source-of-truth documents must be updated at cutover.
