# Native navigation audit — 2026-11-02

Tal requested that only Settings switch between appearances. This supersedes the old temporary bridge policy; existing financial behavior remains shared.

## Audit and concrete gaps

The audit searched all native components, navigation helpers, action-center destinations, original action dispatch, and server/provider returns. Fifty static bridge anchors across39 files, plus the Settings collection of12 original-interface shortcuts, were traced to the existing native routes below. Error-only bridges for missing/locked/unavailable data were removed: the shell already connects onboarding, native security/unlock, refresh and access errors. No eligibility, viewer, account-binding, source, revision or write guards were removed.

| Bridge family | Existing native functionality verified in source |
| --- | --- |
| Bank/card overview and errors | Account setup/edit, monthly reporting/correction, payer/remainder assignments, billing source corrections, stop/no-activity and report library |
| Monthly reporting | Per-account reports/corrections and card billing. The no-account form already uses `saveMonthReport`; now also exposes the original income description and signed cash balance via `setReportedCashBalance`. Bank/source-aware restrictions remain and show their actual native destinations. |
| Reports, groups and sources | Library, original grouped inbox controller/version1 drafts, re-review/activity cycles, archive/reactivation/deletion, bank history/undo. Single-source limitations direct to the native group;10-source/20MB limits also exist in the original intake. |
| Notification tasks | Gmail, private notice, Drive and stored report were native. Missing upload/unlock/save routes are now native; upload retains the task's own month and explicit bank/card hint. The library carries hints into review; detected identities and saved decisions take precedence. `inboxHintTarget` is shared with the original inbox instead of a second matching rule. |
| Savings, goals and investment | Existing balances/allocation/deposits/requests/schedules/growth/simulation editors; redundant generic footers removed |
| Plans, scenario and loans | Existing native create/edit/remove, scenario/apply and loan payment editors |
| Details, categories and recurring | Existing detail/cheque create/edit/clear/delete, categorization/split/tags, dictionary lifecycle/limits, analysis and recurring evidence review. Useful cross-links point to native management/assignments. |
| Security, history and device drafts | Existing native encryption/password/recovery/device/export/import/history/undo. The original month-only draft now resumes note, balance, combined off-card input and pending month edits; partial text stays partial, incompatible/stale/additional-plan edits remain preserved/exportable and are never partially applied. |
| Overview, private matches and migrations | Existing native overview/matching and manual/imported/card/savings migration review/apply/undo; stale original-interface footers removed |
| Settings, help, access and spaces | Existing native routes. The original Settings shortcut collection is removed; `InterfaceLayoutSetting` remains the only appearance switch. |
| Gmail/Drive | Native Gmail filtering/labels/preview/scan/notices and native Drive scheduling/run/archive/download already exist. Drive's actual OAuth connect/reconnect control was missing: added actor-bound, guarded native connection, stored return context and native success/cancel/failure return. Original pending rows and callers remain compatible; no schema change. A native Gmail callback now retains its native failure destination if access is revoked during consent. |
| Apple Pay | Existing native review/connection/export controls remain. The link to the abandoned copy-to-month workflow was removed under Tal's explicit Oct29 scope exclusion; no new Apple Pay development or support claim. |

Settings' existing layout selector and guarded cookie/navigation behavior are retained. The original application remains reachable by deliberately selecting it there. No financial model was rewritten and no provider permission/schedule was changed by this audit.

## Evidence

Exact build/typecheck,1124 regressions and15 core checks pass. Added regression checks cover the Settings-only navigation boundary, every original notification screen's native route, task month/scope/hints, original hint precedence/contradicting card numbers, monthly note/signed balance equivalence to the original commands, partial/pending device-draft recovery, and scoped Drive connection URLs. Real isolated service tests cover Drive native success/cancellation/provider failure, original-client compatibility and actor refusal, plus Gmail access revocation without credential installation.

Synthetic browser:41 representative native screens at390×844 have no original-interface anchors and no document overflow. The screenshot's monthly page opens a native account form with all account/month fields. A notification clicked from October opens the January task in native upload with the correct card. The native Settings selector still offers both layouts. Viewer scope remains read-only. On a separate synthetic personal budget, the new note and−12.34 bank balance survived a refresh/stay guard and saved explicitly once as actual data; no real records were used. Screenshot: canonical ignored `outputs/native-navigation-2026-11-02/monthly-phone.png`.

The route sweep covers rendered normal/error states of the seeded fixture; it is not proof of every conditional form, real iPhone touch behavior or real Google authorization. Existing broader financial regressions remain the primary parity evidence. No real Google, production financial edit, Sites, audience, hosting upgrade or other service change was made during local acceptance. Publication has separate release evidence.
