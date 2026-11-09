# Inline report comparisons and reversible matching decisions

Status: application `f07d51a` is verified live at https://budgit.duckdns.org/next/incoming. Release evidence: `docs/ui-redesign/evidence/release-matching-comparison-2026-11-09.json`. Git source and independent Tazrim tracked-source backups accompany the release.

## Problem and existing behavior

The previous guided review rendered only pending matching questions. Choosing “separate action” removed the question from that list, so its control disappeared even before import. Saved drafts retained the decision but reopening the same review still hid it. Users also had to leave the report to inspect possible existing bank records.

## Bounded implementation

The original shared `buildReportInbox` now derives `item.matchReviews` from the original conflict/candidate evidence **before** applying saved choices. Both unresolved and selected bank/card decisions remain available. This derived presentation data is not added to the version-1 stored draft format. Original `changeReportInbox` still sets decisions; resetting removes that decision and restores the original required check. Source records are not rewritten.

The native `ReportMatchReview` displays the incoming movement alongside saved records from the selected account, with signed amounts, dates, descriptions, references, saved classifications, source filenames and missing/different evidence. Search stays local to that account and the current budget; more results and every review row remain accessible through bounded lists. A record coming from another uncommitted member of the group is explicitly marked as not yet imported.

Clear radio choices distinguish leaving a decision open, reusing an original supported exact match, and importing a genuinely additional record. Selected decisions stay visible, including after progress save/reload and after every matching question is resolved. The whole-file duplicate shortcut no longer hides a group with manual matching decisions. The prior classification view links directly back to the same stable decision anchor.

The financial matcher is unchanged: similar dates/amounts are comparison evidence, not permission to attach an arbitrary existing row. When the original engine cannot authorize “same,” the UI explains that and allows an unresolved decision; it does not imply that “new” is required to advance. No heuristic matching, new financial engine, schema or server endpoint was added. Final import, role/actor/revision/source checks, uncertain-write retry locks and all original duplicate/card/loan/month safeguards remain.

## Verification

Build/typecheck, 1,361 regressions and 15 core checks pass. Focused contracts cover New/Same/reset, original draft round-trip, retained all-resolved decisions, card manual-detail choices, changed/missing evidence, account-only search, group-member evidence and immutable financial/source records. Synthetic browser checks cover 40 inline comparisons, local search, decision reversal after progress save/reload, retained fully resolved groups, card link/reset, 320/390/430/1440px RTL, dark/reduced motion, zero financial writes and the prior classification/recovery/viewer acceptance.

Physical iPhone acceptance remains unverified. Existing uncertain-write locks still require the same-action retry before editing resumes. No real financial import or production report decision is performed by implementation or acceptance testing.
