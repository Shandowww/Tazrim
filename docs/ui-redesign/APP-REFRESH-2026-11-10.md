# App refresh

The native header and top-pull previously called `useBudget.refresh`, which
retrieved saved data without loading newly published interface code. Both now
use the original interface's guarded full-page refresh approach: check the
current document over the network, then reload the same route. HTML is served
with `no-store`; the new document selects content-hashed JavaScript/CSS assets.
The notification-only service worker does not intercept or cache requests.

The existing draft guard runs before checking the connection and again before
navigation, protecting edits or saves started during the check. No financial
write occurs unless the user explicitly chooses the existing Save and Continue
action. Failed, timed-out, invalid and login responses preserve the running
page, drafts and last data with an actionable retry. Concurrent requests and
navigation to another route/scope cannot trigger a stale refresh. Editor-local
data refresh commands retain their existing behavior.

Validation: build/typecheck, 1,421 regressions including document readers,
15 core checks and 34 focused original/native refresh and gesture checks pass.
Physical iPhone/PWA acceptance has not been repeated. A page already running
the old implementation needs one browser reload or PWA reopen to receive this
fix; later in-app refreshes load both interface and saved data.

Application `a556d9c` is verified live. Isolated backup/rollback and runtime checks passed; all 50 authoritative tables, configuration/keys and adjacent services were preserved. Evidence: `docs/ui-redesign/evidence/release-app-refresh-2026-11-10.json`.
