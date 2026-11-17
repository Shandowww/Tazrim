# Looking ahead — desktop and PWA prototype

## Graph and mobile-card refinement

Application `76340c5` refines the accepted desktop layout with a curved dashed projection, subtle shaded area, clearer month/value cells and an amber safety-buffer reference. Curves stay within their endpoint values and missing data leaves gaps. The area is decoration, not a statistical confidence interval; exact month-end values remain visible.

The mobile card now exposes account selection, next month's expected balance, the lowest expected month (only when all three balances are available), a compact three-month chart, safety buffer and two upcoming payment previews with distinct type icons/colours. Header and footer links open the full forecast with the selected account. Existing missing/stale-data and below-buffer warnings remain. Layout reflows at enlarged text sizes. No calculation, record, navigation inventory or financial write path changes.

Build/typecheck, 13 existing focused outlook/home/menu contracts and 15 core checks pass. Browser checks cover both themes at 320, 375, 390, 430, 768, 844, 1440 and 1920px, including landscape, currency spacing and 44px controls. Account switching, keyboard Enter, full-view account retention and Back pass with unchanged sample data. At 200% root text the new card fits 320px; the surrounding existing page has 3px overflow, so whole-app large-text acceptance is not claimed. No new motion was added, and no physical-iPhone/installed-PWA acceptance is claimed. This is still a preview-only refinement.

## Initial prototype

Review-only application `54839f4`, on the isolated adaptive preview. Production promotion requires Tal's explicit approval of the reviewed design.

Desktop Overview replaces the three planning shortcuts with a three-month forecast beside upcoming saved commitments. At intermediate widths the panels stack. Below 768px Overview shows one compact outlook card; it opens `/outlook`, retaining the period, budget and chosen account. The normal small Back control and browser history return to Overview, whose primary navigation stays selected. This adds no menu entry.

The existing Budgit palette, backdrop, typography, appearance controls and isolated symbol-left shekel formatting are retained. Per-account buttons have 44px targets. The forecast is dashed and labelled as an estimate, with exact monthly values, a safety-buffer legend and a month-end limitation. It never celebrates a predicted balance.

The read-only adapter reuses `cashAccountForecast` (or original `forecast` for legacy budgets), without changing financial calculations. It starts at the current month or the month after the selected Overview period, whichever is later. Accounts are separate; missing balances or original projection issues are shown as missing, while stale reporting is disclosed separately. Saved pending card bills, planned purchases, pending cheques and loan schedules supply reminders. Existing payment evidence suppresses fully paid loan reminders; saved card bills suppress corresponding installment reminders. Unknown days remain month-level dates. Reminders do not add further deductions. Basic mode retains readable planning reminders without exposing unavailable routes.

Synthetic November–January estimates and upcoming examples exist only in the disposable preview seed. No real records or production configuration are changed.

Validation: build/typecheck; 1,458 regressions; 15 core checks; 13 focused outlook/home/menu checks. Browser inspection covers desktop and phone, light/dark, 320–1920px no overflow, shekel spacing, account selection, compact-to-full navigation, Back, Basic mode and unchanged sample data. No physical iPhone, installed PWA or operating-system Back-gesture acceptance is claimed. See the companion evidence JSON for hosted checks.
