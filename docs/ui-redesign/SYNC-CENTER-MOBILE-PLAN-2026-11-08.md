# Mobile sync center — design approval and Sol execution plan

Requested by Tal, 2026-11-08. **Tal approved the functional direction and explicitly instructed Sol to start execution. The appearance and entry-point constraints below remain binding.** See [the implementation checkpoint](SYNC-CENTER-IMPLEMENTATION-2026-11-08.md) for completed work and validation; application `ac2a05b` is now verified live; see the linked release evidence.

## Approval and appearance constraint

**Entry point and navigation clarification:** Sync Center stays inside its existing app menu entry. Do not add Sync to the main/bottom tab bar, move or replace a main tab, reorder the app menu, or redesign any global menu. The four proposed tabs belong only inside Sync Center. The prototype's earlier sample bottom navigation was misleading and has been removed; it is not an implementation requirement. Preserve the application's existing global navigation as it is.

Tal likes the proposed functionality and navigation. Preserve the existing main app and menus' theme, colors, typography and component styling. The prototype's visual palette and sample menu styling are illustrative, not an approved restyling. Implement the focused sync views, report navigation and missing-month overview using the app's existing design tokens and components, including current System/Light/Dark behavior. Preserve the existing global header, menu structure and navigation appearance; add only the sync center's internal navigation and functional screens. Do not change global CSS or theme tokens to match the prototype. This clarification records design scope; it does not start execution or enable an automation policy.

## Outcome

The sync center must answer three questions quickly on a phone: what needs my decision, which reports must I download, and where can I find a particular report? Give these activities separate navigable screens. The existing single-report Next/Finish workflow remains; the center surrounding it also needs a mobile information architecture.

Prototype: [interactive sample](prototypes/sync-center-mobile.html). All names, reports, amounts, settings and outcomes in it are synthetic and in memory. It has no network requests or production actions. Approval covers the navigation, information hierarchy and coverage interactions, not changes to financial semantics.

## Four main views

| View | Show initially | Open on a separate screen |
| --- | --- | --- |
| **לטיפול — Needs attention** (default) | Short actionable report rows; count of decisions needed; clear empty state; Add report. Distinguish waiting for automatic preparation from needing a user decision. | One report's next action, original, routing, proposal or resumable guided review. |
| **מה חסר — Missing reports** | Six-month visual coverage for the explicitly selected budget, by bank/card; missing and awaiting-review totals; bounded account pages. | Tap an account/month to see the evidence, what to download, or the report already waiting for review. |
| **הדוחות — Reports** | Search, lifecycle filters, budget filters, compact dated rows and bounded pagination. | Report details, original download, retention date, proposal and secondary actions. |
| **הגדרות — Settings** | Short links to folder connections, preparation policy and expected-report settings; brief current status. | Focused connection/setup screens, explicit preparation consent, scheduling instructions and existing expected-report editor. |

Use Hebrew/RTL, the existing compact app header, current budget selector and persistent app navigation. Do not add a second logo/header or duplicate global navigation. Keep tab labels visible with icons; selected state must not depend on color alone. On small screens use four equal touch targets. Tabs are actual URL-backed views with browser Back and reload support.

### Needs attention and report details

- Show at most six compact report rows per page. Each row contains a readable filename, lifecycle/next action, destination budget/account when known and date. Long names truncate in the row and remain fully readable on the detail screen.
- A primary tap opens that report, not another long feed. New/unassigned reports enter the existing exact-file approval and account identification steps. Routed New/Partly digested reports open/resume their existing guided review. Digested reports open results.
- Put download, file metadata, retention explanation, re-prepare/reject and private-copy deletion behind the selected report's secondary actions. Never display every report's proposal or buttons in the feed.
- Separate queued/working reports from actionable decisions. Imported financial data alone is not full digestion; deferred categories and incomplete coverage still require their existing follow-up.
- Keep the final financial save explicit in Stage 2. Next preserves review progress. The original commands, uncertain-result recovery and revision checks remain authoritative.
- After completion, return to the prior filtered list/page and show the actual saved result. Preserve list position on Back. Do not reset search or scope just because a report was opened.

### Reports and growth

- Filters: All / New / Partly digested / Digested; All authorized inbox destinations / selected budget / unassigned; filename search. Add an explicit month filter only where verified report-month metadata exists; upload date is not the statement month.
- Keep completed reports out of the default attention view. Preserve the existing full-completion-plus-30-days removal policy; incomplete files never expire automatically.
- Pagination replaces unbounded append/infinite-scroll lists. Search/filter results cover the available dataset, not merely the current page. Show count and page controls. Clamp the page after completion/removal/filter changes.
- Current APIs validate at most 500 sources. Inspect actual service quota/paging behavior before implementation; preserve actionable capacity errors and never silently truncate while claiming all results. Do not add server pagination unless required by the current contract.
- The private inbox spans the signed-in user's permitted destinations; coverage is for one explicitly selected budget. Label that distinction. Never mix another user's reports or infer a shared destination from a filename.

### Missing-report visual overview

1. Show six chronological months, oldest at the right in Hebrew. On narrow screens use two rows of three comfortable month tiles per entity; on larger screens a six-column row. Include year labels across year boundaries.
2. Start with the latest six completed months; offer previous/next ranges and a month/year picker, including the current month when requested. Never create missing tasks for future/pre-budget months or retired card periods.
3. The approval prototype uses one bank/card panel at a time with an account selector. Keep that compact default; show at most two panels if later approved. Display missing totals for the whole selected range and budget, not just the visible account.
4. Show explicit icon-and-text states: report received/imported; report already awaiting review; partial bank coverage; missing source; confirmed no activity; period not yet due/open; explicit exception/not required. Reuse existing due/grace/exception rules. Distinguish missing source evidence from an overdue task.
5. Tap a month to open a focused account/month screen: exact bank/card, month, state, reason and one useful action. A missing file explains which report to obtain and offers upload or folder instructions. A staged assigned report opens the existing review instead of asking for another download.
6. Manual amounts and a card charge in the bank do not prove a card statement exists. Partial bank data does not prove full-month coverage. An uploaded unverified file is not inferred to cover a month. Saved report evidence must still count after the stored original expires.
7. Existing card no-activity declaration/undo remains available through its guarded screen for eligible closed months. Never introduce a new zero-balance shortcut or infer absence of activity from a missing file.
8. Coverage loading, locked-budget, failed-read and genuinely empty states must be distinct. A failed optional data fetch must not produce a false “everything complete” or “missing” assertion. Retain the last usable display with a stale/error notice where appropriate.

### Setup and secondary screens

- Add report is its own screen with the existing storage consent when required, file selection and actual upload receipt. Return directly to the relevant report after successful upload.
- Connection setup uses focused steps: folder selection guidance, production connection key, then platform-specific scheduling/cleanup settings. Existing users see their connection status first. Never expose keys in a list, URL, screenshot fixture or logs.
- Preparation policy remains per-budget owner opt-in. Do not enable it merely by opening Settings or approving this design. Settings should distinguish uploaded, prepared and financially applied states in plain language.
- Preserve the separate device cleanup-after-verified-storage and server-original removal-after-full-completion rules. No Shortcut, scheduler or retention rewrite belongs in this UI task.

## Reuse map — inspected source

| Existing behavior | Authoritative implementation | Planned connection |
| --- | --- | --- |
| Private inbox, approval/routing/upload/cleanup | `frontend/src/app/incoming-reports-page.tsx`, `report-intake-api.ts` | Recompose existing handlers into focused views; retain account-bound APIs and draft guards. |
| Automatic preparation policy and proposals | `frontend/src/app/report-automation-panel.tsx`, `report-automation-api.ts` | Separate policy/settings from a single selected report's proposal. Remove the second all-jobs feed. |
| Guided review and lifecycle/retention copy | `report-group-page.tsx`, `report-guided-review.tsx`, original report commands | Resume the current flow; do not build another importer or redefine Digested. |
| Historical annual card month grid | `src/details.js`: `cardStatementCoverageView`; `src/card-billing-model.js`: `cardStatementCoverage` | Restore the visual capability in the sync center using the original evidence rules. |
| Bank/full/partial/month coverage | `src/budget.js`: `monthlyDataCoverage`; `coverage-read.ts`, `coverage-controls.tsx` | Add bank panels and keep evidence distinctions. The analysis coverage screen can remain available. |
| Expected deliveries and pending assigned sources | `src/action-center-model.js`: `actionIssues`; `report-expectations-api.ts`, `server/actions.mjs` | Reuse due/grace/exception and staged-report facts. Verify exact account/kind/month correspondence, including grouped reports. |
| Card no-activity action | `frontend/src/app/billing-page.tsx`, `billing-command.ts` | Deep-link the existing guarded declaration/undo. |
| Navigation/protection | `link.tsx`, `navigation-query.js`, `draft-guard.tsx`, existing routes in `frontend/src/main.tsx` | Preserve actor, budget, period, draft confirmation, scroll restoration and focus. |

Inspection found the older grid in the original interface and coverage in native analysis; the current incoming page does not render that overview. This does not establish the exact historical release when Tal stopped seeing it. Do not delete or rewrite the surviving coverage models.

## Sol work packages

### 0. Approval and baseline

- [x] Record Tal's approval of the functional direction and requirement to preserve the existing app/menu appearance.
- [x] Map prototype controls to existing app components and tokens; preserve global appearance and menu/navigation source.
- [x] Work only in `work/budgit-household-ui`, branch `codex/budgit-household-ui`; preserve unrelated work.
- [x] Confirm running application `2208e67` and image `sha256:7defa0a67044b9491006bc4c1e3244b71e1505945c5c8a3a75f7f9d9592a11fd`; retain existing API contracts and 500-source quota.

### 1. Navigation and information hierarchy

- [x] Add four URL-backed views, focused report/detail/add/settings routes and explicit active-state labels.
- [x] Keep the existing menu entry as the Sync Center entry point. Verify that main tabs, menu ordering, global menu styling and colors are unchanged; the new four-view navigation exists only within Sync Center.
- [x] Preserve browser Back, list/search/page position and focus; protect local drafts during tab/budget/route changes and refresh.
- [x] Move setup, policy and all per-report secondary content out of the default feed. Show useful next actions and trustworthy counts.

### 2. Scalable report browsing

- [x] Implement bounded lists, search and lifecycle/destination filters with honest empty/error/loading states.
- [x] Merge inbox/proposal presentation by exact receipt/source identity; do not create duplicate rows or conflate two formats by name.
- [x] Connect original guided review, original download, retention information and confirmed private-copy deletion on focused screens.

### 3. Restore coverage

- [x] Add the six-month bank/card overview, entity paging, range controls and selected-budget label.
- [x] Reuse original card/bank coverage and expectation facts; connect exact pending reports and existing no-activity actions.
- [x] Add account/month drill-down with actionable missing-file instructions. Keep source availability, completion and overdue status distinct.

### 4. Verification

- [x] Test 0, 1, 30 and the supported maximum number of synthetic reports; filtering across pages, long Hebrew filenames, removal on the last page and preserved Back navigation.
- [x] Test card file/manual/bank-only/no-activity/retired states; full and partial bank months; year boundaries; future/pre-start months; expectations, grace and exceptions; pending/failed/grouped sources; removed originals with preserved financial evidence.
- [x] Verify private/shared viewer isolation in the synthetic browser and retain the original actor-bound reads, locked-budget refusal and failed-read handling; the full original service suite and isolated access gates pass.
- [x] Exercise unsaved approval/routing/file/policy drafts across tabs, browser Back, global menu, refresh and budget switch. Keep key visibility and uncertain mutation results guarded.
- [x] Run focused regression tests, frontend typecheck/build and required release checks. Use existing original-model tests for parity; do not test only a copied implementation.
- [x] Verify synthetic 320/390/430px and desktop bounds, RTL, earliest month at right, existing System/light/dark behavior, focus/labels and reduced motion.
- [ ] Tal's physical iPhone pass remains a device acceptance follow-up; no new device run is claimed.

### 5. Release and handoff

- [x] Publish only under the existing release authorization and backup/source-match/isolated-preflight/rollback/runtime verification process. Preserve production finances, keys and adjacent services.
- [x] Record what was tested, the commit actually published and remaining device limits. Keep Git backups/source exports consistent with project instructions.
- [ ] Return to remaining scheduled-delivery acceptance and Stage 2 comparison evidence after this UI task. Stage 3 stays disabled until its independent plan gates pass.

## Done means

On a phone, Tal can identify the next report needing a decision without scrolling past setup; find a stored report without traversing the entire archive; see which month is missing for each bank/card; and tap straight into the relevant review or download instruction. Completing ordinary work never requires navigating a wall of setup text, proposals and report metadata. Existing financial, lifecycle, privacy and retention behavior remains intact.

## Planning checkpoint (historical)

The planning agent removed its uncommitted implementation drafts after Tal reserved execution for Sol. This change contains documentation and a standalone synthetic prototype only. No app runtime, financial data, automatic policy, Shortcut or deployment is changed.

Prototype verification covers the initial attention view, missing-month layout, dark 320px report detail and synthetic click-through checks for bounded report paging, list return, month-to-existing-report navigation, guided Next/Finish, lifecycle changes, approval before parsing and settings separation. This is prototype evidence only; production behavior and physical iPhone acceptance remain Sol's implementation gates.
