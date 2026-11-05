# Frontend assets across releases

## Incident — 2026-11-05

An already-open app retained the previous release's JavaScript entry point. Opening Loans or the purchase calculator later requested that release's lazy modules. Replacing the application image removed those files, producing Safari's “Importing a module script failed” error and the default router error screen.

Read-only production checks confirmed the previous Loans and calculator module URLs returned 404, while the current module URLs returned 200. Fresh-session acceptance alone had missed this transition.

## Repair

- Startup copies only recognized hashed frontend assets into `react-assets` beside the configured database. This uses the existing data volume and contains application code only.
- Current packaged assets take precedence. Missing hashed assets can fall back to the retained files after the existing session and allowlist checks. HTML and API responses never use this fallback.
- Current assets refresh their retention timestamp on startup; assets absent from the current build expire after 30 days. A conflicting immutable filename refuses startup instead of replacing bytes.
- The first repair deployment seeds assets from the recent live images so sessions predating this feature can still import their original modules. Subsequent startups retain their own assets automatically.
- A screen error boundary keeps the app navigation available and offers Hebrew recovery. Reload is explicit, first checks connectivity, retains the route/space/month and uses the existing draft guard. Failed connectivity checks leave the recovery screen usable.

## Release checks

Keep a browser session on the previous release, switch the serving build, then open previously unopened Loans and calculator screens without a document reload. Check the original modules are served and the selected space/month remain intact. Also inject a failed import and an offline health request, verify the recovery screen and Back action, then restore connectivity and reload explicitly.

Automated acceptance covers 390px and 1440px, shared scope/month, Basic calculator access, Hebrew recovery, no overflow and unchanged synthetic financial hashes. Server regressions cover retained imports, current HTML, immutable bytes, expiration, collision refusal, authentication, revocation and invalid paths. Fresh physical iPhone Safari acceptance is not claimed.
