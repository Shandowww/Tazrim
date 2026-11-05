# Compact header — selected Option 1

Tal selected Option 1 on 2026-11-05: one visible account switch beside the notification bell and refresh, with the app name and wallet mark removed from the header.

The header measures 61 CSS pixels including its border, excluding the device safe area. Controls retain 44px touch targets. Two budgets use one-tap personal/shared buttons with full names in accessible labels/tooltips and desktop text. One budget shows its name; more than two retain the existing select control. Viewer status remains visible.

The existing period picker now sits alongside each page heading and wraps below the title on narrow screens. It retains previous/next, month/year selection, scoped query parameters, navigation history and draft guards. The dashboard keeps its existing title/report period presentation. A shared PageHeading provides this layout without changing page commands or financial calculations.

Build/typecheck, 1,165 regressions and 15 core checks pass. Synthetic acceptance at 320/390/430/1440 checks header height, scope switching, touch targets, page-level period controls, no overflow, month-picker behavior, guards for month/scope/refresh with an unfinished calculator draft, bell dismissal, viewer identity, one/multiple budgets and unchanged financial hashes. Home Light/Dark and Loans/Accounts phone screenshots were visually inspected. Fresh physical iPhone acceptance is not claimed.

Evidence: `evidence/compact-header-browser-2026-11-05.json`.
