# Next improvements — 2026-11-05

Status: implemented and published to the existing server. Application `e6df93ee568be21a5958b268e485276d2ca77b7c` is verified live; see `evidence/release-improvements-2026-11-05.json`. Physical iPhone acceptance of the new controls remains unverified.

## 1. Familiar pull-to-refresh indicator

- Replace visible “משיכה מטה לרענון” / “אפשר לשחרר כדי לרענן” text with a small circular indicator: progress follows the pull, the threshold indicates readiness, and the circle spins during the actual refresh.
- Dismiss after confirmed completion. Keep actionable failure text and the last usable data; retain screen-reader announcements and the desktop refresh button.
- Preserve the existing upper-screen start zone, scroll/swipe/control/dialog exclusions and unsaved-edit protection. Respect safe areas, System/Light/Dark and reduced motion.
- Acceptance: Safari touch check for pull/cancel/release/error and ordinary scrolling; focused gesture regressions. Apply the same behavior to both supported interfaces.

## 2. Three interface modes

One app, shared calculations and storage. Modes control which options are visible; existing account roles still govern every read and write.

| Mode | Main experience | Available actions |
| --- | --- | --- |
| Basic / בסיסי | Gather reports and understand the current position | Essential account/report setup, upload or connected report intake, required review and confirmation, balances, monthly summary, read-only goals/commitments and all important notifications. |
| Advanced / מתקדם | Basic plus routine manual planning | Manual income/balance corrections, goals and saving amounts, planned purchases, cheques, loans and transfers; common account/report/reminder settings. |
| Expert / מומחה | The complete current interface | All existing tools, including detailed reconciliation, source editing/history, category rules, allocation, migration and administrative tools where authorized. |

- Offer Basic during new-user setup; preserve Expert for existing users. Keep an obvious mode selector and remember the choice per signed-in user, independently of the selected personal/shared budget.
- Always retain account/scope identity, appearance, refresh, security, sign-out, data export, required import decisions, save errors and critical warnings.
- Switching modes never changes records, calculations, roles or notification visibility. Protect drafts before switching. A direct link to an advanced tool explains the required mode and offers a switch while retaining destination and scope.
- First map every existing route/action to the three modes. Reuse existing forms, commands and guards; do not maintain three copies of the application.
- Acceptance: a new user can complete setup → report → review → saved summary in Basic; manual edits work in Advanced; Expert retains current features; personal/shared and viewer/editor tests pass in every mode.

## 3. Extract issuer messages from statements

- Extend the existing report readers and notification center. Existing Gmail bank notices provide a related integration, but embedded statement notices need their own source association and extraction coverage.
- Start with supported statements containing readable text. Inventory representative bank/card layouts before promising coverage; scanned pages/OCR and unsupported layouts are a later, separately assessed extension.
- Extract upcoming charges/fees, account issues requiring attention, promotions, general updates and changes to terms. Keep the original wording, issuer, account/space, source document/page and any explicitly stated amount, deadline or effective date. Mark uncertain interpretations for review.
- Show **Needs attention / לטיפול** for actionable issues and **Updates / עדכונים** for information and promotions. Keep every message accessible; promotions remain quiet and do not inflate the urgent badge. Reading a notice does not resolve the underlying issue.
- Upcoming charges and revised terms are information until the user explicitly acts through an existing financial workflow. Extraction never adds charges, changes forecasts or accepts terms automatically.
- Deduplicate repeated extraction/import and overlapping email notices within the correct account/space, while retaining genuinely new dates or changed terms. Reuse per-user read/snooze state; provide original-source access and clear extraction failure/unsupported status.
- Persist notices with the existing source encryption, permissions and lifecycle. Respect locked budgets, revocation and source deletion/archive; never show private notices in shared space. Treat document text as content, not executable instructions.
- Acceptance: representative/redacted fixtures for each category, Hebrew/RTL text, explicit versus inferred dates, repeated imports, revised terms, missing/unreadable text, archived sources, encryption and cross-user/space isolation. Confirm zero financial changes from extraction or reading.

## Delivery order

1. Circular refresh indicator and bounded Safari acceptance.
2. Route/action mode matrix, selector and Basic/Advanced presentation; verify Expert parity.
3. Supported-document notice extraction, persistence and notification-center integration, validated against representative statements.

Use the current household source branch and the established build/regression, backup, isolated preflight and existing-server publication gates for each implemented release. No new hosting, external document-processing service or push-notification capability is assumed.

## Existing connection points

- Refresh: `frontend/src/app/pull-refresh.js`, `frontend/src/main.tsx`, `src/client.js`.
- Mode inventory: `docs/ui-redesign/feature-coverage.md`, existing routing/navigation/settings and draft guards.
- Statements: `frontend/src/app/report-reader.ts`, `tools/bank-csv/`, existing stored-report services.
- Notices: `src/action-center-model.js`, `frontend/src/app/action-center-api.ts`, `frontend/src/app/global-action-center.tsx`, `server/gmail-import.mjs`.

## Implemented route and action policy

The shared policy is `frontend/src/app/interface-mode-model.js`. Links, grouped menus and direct routes use it. Unlisted tools require Expert; Expert accepts every current route. Existing roles and server checks remain authoritative.

| Minimum mode | Routes and actions |
| --- | --- |
| Basic | Home; bank/card/cheque/loan/category summaries; read-only saving goals; report upload, saved-group review and required import decisions; essential account/card setup; all notifications and source notices; profile, appearance, spaces, security, backup import/export, Gmail, Drive and device-draft recovery. |
| Advanced | Monthly/account corrections; planned income and purchases; recurring estimates; cheques and manual details; loans; saving goals, deposits and schedules; transfers; card billing/no-activity/estimate retirement; report expectations and forecast settings. |
| Expert | Source editing/history/undo/archive/delete; detailed reconciliation and payer repair; category administration; cross-space review/migration; investment simulations; saved analyses; server administration; Original interface and remaining existing tools. |

- Modes are remembered per actor on each device, across selected spaces. A new actor with no plan starts Basic; an existing actor starts Expert. Selection protects drafts and keeps the current URL, period and space.
- Read-only summaries hide manual action links in Basic. Saving-goal controls also receive the read-only flag. Required notification links remain available, with an explicit mode switch at the destination when needed.
- Manual report uploads scan for issuer notices after source storage succeeds. Historical or externally delivered reports have explicit scan/retry controls under **עדכוני בנקים ומנפיקים** in More, Settings and the notification center.
- Notice extraction uses local readable PDF/CSV/Excel text. It stores original text/page, explicit valid dates, verbatim amounts and issuer/account identity. No financial command is invoked. Scanned documents and unsupported layouts require original-source review; there is no OCR or universal provider-coverage claim.
- Scans have encrypted storage and independent CAS revisions. Failed retries preserve previous notices. Source archive hides notices, reactivation restores them and deletion cascades. Exact duplicate messages retain source links; email overlap is suppressed only with matching explicit issuer/account identity and identical text.
- Informational updates remain quiet and have per-user read state. Attention notices use the existing personal snooze workflow. Reading never resolves a bank issue or accepts terms.
- Notices participate in the existing encrypted backup and source-decryption checks. No new external service or push mechanism was added.

Automated validation covers five notice categories, Hebrew PDF bytes, bounds/transaction exclusion, encryption, idempotent retries, failed-scan retention, archive/reactivation/deletion, actor/space isolation and permission downgrade during a request. Physical Safari acceptance for these new controls remains a separate device check; automated Chrome touch checks do not establish it.
