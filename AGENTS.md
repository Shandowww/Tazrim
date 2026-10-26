# Monthly Flow project context

## Active publication destination — 2026-10-18

Tal explicitly approved publishing this canonical checkout to `https://budgit.duckdns.org` on the existing server and backing up the same commit to GitHub. Leave Sites unchanged. This overrides older Sites publication instructions below; retain the historical Site identity for build validation only. Use a fresh verified SQLite backup, an isolated financial preflight and rollback image before updating the service; verify runtime build hash, health and unauthenticated access afterward. No hosting/resource upgrade is authorized.


## One current source — 2026-10-11

The canonical checkout is `/Users/talshandor/Documents/personal-projects/monthly-flow`. `/Users/talshandor/Documents/ChatGPT/Monthly Flow Budget` now contains only a relocation notice, with no independent source checkout. Open the canonical project in Codex for all future work. Always work here, retain the Site ID in SOURCE-OF-TRUTH.json, and publish the same commit to Sites and the GitHub backup. Build refuses a different Site identity. The app menu displays a content-derived build identifier; refresh an already-open app to load published changes. HTML and budget responses use no-store.

The former personal-projects checkout is preserved at `/Users/talshandor/Documents/personal-projects/monthly-flow-legacy-2026-10-11`. It includes unpublished Apple Pay integration work and the wife's old Site identity. It is an archive, not a source to edit or deploy. Do not merge its hosting identity or copy its source over this checkout. Reconcile any needed feature individually with tests.


Read README.md and PROJECT-HANDOFF.md before changing this app.

This is a personal monthly cash-flow planner. Preserve the user's workflow: monthly card totals, income, transfers, savings/investments, occasional income and planned purchases, without individual transaction tracking. Keep the UI in Hebrew, RTL, with Apple-inspired system typography and mobile navigation. Isolate numeric amounts from RTL text so signs and currency remain readable.

The source is plain JavaScript, CSS and a Cloudflare-compatible Worker. Build with `node build.mjs`; verify relevant changes with `node verify.mjs`; preview locally with `node preview.mjs` (port 5173). Production stores budgets in D1 by authenticated user ID. The local SQLite preview uses a separate test identity; never introduce that identity into production. Preserve validation, user isolation, revision conflict checks and protection against double-counting card installments.

This folder is the separate copy registered under the user's own Sites account. Reuse `.openai/hosting.json` for future publishing. The previous Site belongs to the user's wife and must remain untouched. Live budgets are not copied with source files. Import any exported budget through the app settings and save it under the current user identity.

No new server or paid resource upgrade has been requested. Keep the app lightweight. Offline support remains optional; chart axes and home-screen metadata are implemented.

Read APP-GUIDELINES.md for the user's general app appearance and behaviour defaults. Pull-down refresh and the desktop refresh action must preserve unsaved budget or item edits; failed refreshes preserve the last usable budget. Keep the existing Site audience, including the invited viewer, when publishing.

Provide a System / Light / Dark appearance setting, defaulting to System and remembered per device. This app uses a Spent-inspired soft, playful palette and an original decorative neighborhood; retain readable financial values and actual-only achievements.

## Savings scope — 2026-10-11

Personal saving goes to Tal’s personal account; shared saving goes to the shared account with Linoy. In Tal’s personal budget, the shared deposit field records only Tal’s contribution leaving his account, excluding Linoy’s contribution. In a future joint household budget, the shared deposit will represent the combined contributions from Tal and Linoy. Keep this meaning explicit per budget; do not infer it from destination bank account or silently alter stored amounts. The user requested separate deposits only for now: retain combined savings balances and goals, without inferring account allocations or changing existing amounts.

## Fork snapshot branch

This `Shandowww/Tazrim` branch is a tracked-source export of the Budgit React development checkpoint named in `docs/tazrim-migration/fork-sync.json`. Development continues in the canonical Budgit source/worktrees; sync completed checkpoints to this fork branch without replacing upstream `main` or deploying incomplete UI. Preserve MIT/OFL notices.
