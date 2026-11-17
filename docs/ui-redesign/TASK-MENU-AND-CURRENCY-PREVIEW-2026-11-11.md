# Layout continuity, task navigation and currency presentation

Review-only change on `codex/platform-adaptive-ui`, following Tal's feedback that the broader web layout was useful but the visual redesign and flat menu were not. Production promotion still requires explicit approval of the reviewed design.

## Visual continuity

The new overview composition, content widths, columns, focused forms and navigation repairs remain. The preview-specific global palette and backdrop overrides are removed. The original Budgit theme tokens, selected background, semantic chart colours and bank-card surfaces apply again, including device System/Light/Dark appearance. No appearance preference or saved financial data is migrated.

## Task menu

The desktop has six main task areas plus Settings and Help in its footer. Only one task area's secondary tools expands at a time. Rare setup and maintenance actions sit under a closed secondary disclosure. The phone More page shows five task choices rather than the previous flat tool inventory; contextual navigation exposes each task's tools on phones. Savings retains its existing contextual controls.

| Area | Existing workflows grouped here |
| --- | --- |
| Overview | Selected-month financial overview |
| Accounts | Banks/cards; transfers; payer assignments; all-space overview; card metadata management |
| Reports | Sync inbox; upload/source library; import history; optional manual monthly update; issuer notices; expected-report settings; action centre |
| Expenses & Analysis | Categories; detail search; comparisons; optional category dictionary/limits and manual detail management |
| Planning & Tracking | Planned items; loans; cheques; calculator; optional future income and recurring expenses |
| Savings & Goals | Goals; investment simulation; savings balances, deposit planning, transfers and allocation |
| Settings | Appearance, modes, profile/sharing, privacy/recovery/drafts, backups, integrations, budget defaults and access maintenance |
| Help | Existing native help |

The existing destinations, role/mode restrictions, actor/budget/period query handling, financial commands, draft guards and return context are reused. No financial workflow is replaced by a new engine. Financial tools no longer repeat as a second menu inside Settings. The combined accounts page no longer repeats the global report/account-management inventory beneath the card detail. The old common account-workflow adapter remains compatible for other account views. Legacy Wallet connection maintenance remains under collapsed Settings, with no new integration work.

## Currency

`MoneyAmount` isolates a shekel symbol and the signed numeric amount as two ordered items, with an explicit gap. This prevents RTL/locale marks and heading tracking from moving or crowding the symbol. Missing reports have text, never an invented zero. Positive amounts, zero, refunds, large values, rounding and minimum decimal conventions remain. Existing cents-based report renderers still divide by 100 at the same presentation boundary as their former formatter. The component covers the overview, combined accounts/cards, search/detail results, bank activity, report transaction/review amounts and the transfer-assignment rows that explicitly forced currency into LTR.

Verification includes rendered signed/zero/missing values, actual symbol/amount bounding rectangles in both themes at 320–1920px, task-area navigation and mobile report-tool access, prior stalled-storage/lazy-import contracts and unchanged synthetic financial data. Exact counts and hosted checks are in the corresponding evidence receipt. Physical iPhone acceptance is not claimed.
