# Focused mobile Sync Center

Implemented from [the approved plan](SYNC-CENTER-MOBILE-PLAN-2026-11-08.md). Application `ac2a05b` is verified live at https://budgit.duckdns.org/next/incoming. [Release evidence](evidence/release-sync-center-2026-11-08.json) records the exact source, runtime, backup and preservation checks.

- Four internal URL-backed views: Needs attention, Missing reports, Reports and Settings. The existing app menu remains the entry point. Global tabs, menus, themes, typography and color tokens are unchanged.
- Report lists contain at most six compact rows per page. Filename search and lifecycle/destination filters operate over the entire supported inbox. Source storage already limits a scope to 500 active originals; no server paging or quota behavior changed.
- Queued/working new reports are separated from decisions requiring attention. Proposals use exact incoming IDs and appear only for the selected report, rather than in a second all-jobs feed.
- File approval/routing, source download, deletion and preparation proposals have focused screens. Folder connection status and three setup steps are separate from everyday report handling. Production key and receipt behavior is unchanged.
- Report review reuses the existing guided group controller and original progress/financial save. An internal return route preserves the originating list filters/page and respects unsaved-work confirmation. Return routes accept only local `/incoming` destinations.
- The missing-report view shows six chronological months, oldest at the right, with one selected bank/card at a time. It defaults to completed months and offers earlier/later ranges and direct month choice.
- Card coverage reuses `cardStatementCoverage`; bank coverage reuses `monthlyDataCoverage`. Due/grace/exception facts come from the original action model. Manual totals, bank card charges, partial files, no-activity declarations, current months and exact pending report references remain distinct. Unknown/unassigned sources do not acquire guessed coverage.
- Missing cells open download/upload instructions. Exact assigned pending sources open their existing review. Card no-activity links use the original guarded screen. Financial source evidence remains after a stored original expires.
- A failed coverage refresh retains the last usable view with an error notice; locked or unavailable data is not reported as complete. Draft, actor, budget, viewer and revision guards remain in the original services.

Validation: frontend typecheck/build, 15 core checks, seven new behavior contracts and the existing application/reader suite (1,333 total tests with this increment). Synthetic native-browser checks cover six-row paging, search outside the current page, list return, protected approval choices, six-month RTL order, direct missing-file actions, 320/390/430/1440px bounds, dark/reduced-motion settings, focused connection steps, original progress save and return, private inbox isolation and shared-viewer coverage. Synthetic navigation/progress checks preserved financial bytes and made zero financial PUTs.

Reproduce the browser check by running `scripts/check-sync-center-browser.mjs` with `PLAYWRIGHT_MODULE` pointing to an available Playwright module. It starts its own generated-data loopback fixture and closes it afterward. No production credential, report or financial data is used.

Physical iPhone acceptance was not repeated. Scheduled/locked-device delivery acceptance remains separate. Stage 3 financial auto-application remains disabled. No parser, financial model, storage policy or Shortcut change belongs to this increment.
