# Loan payment search follows the selected period — 2026-11-09

Application `a1dc026` is verified live. Evidence: [release-loan-payment-period-2026-11-09.json](evidence/release-loan-payment-period-2026-11-09.json).

The loan-payment picker previously ignored the header's year/month query and searched the entire loan term for the associated account. The picker now intersects the selected month (or selected whole year) with the loan term before text search and the existing 200-row display cap. It displays selected and loan ranges and explains selections outside the loan term. The all-time linked-payment list is explicitly labeled as covering the whole loan. No matcher, accounting command, report/source row or stored financial record changes.

A read-only shared candidate projection retains the original account, loan term, linked/other-loan, debit/refund and original-source constraints. Existing link/unlink/remember/stop commands, actor/revision guards, prepared retries and dirty navigation remain authoritative.

Validation: clean build/typecheck,1,297 regressions,15 core checks. Three new contracts use saved synthetic bank reports across January–March, year/month switching, description/beneficiary/date search, account/other-loan/linked exclusions, term boundaries and finding an older match beyond the display cap. Static actual-page rendering verifies the corresponding route results, whole-year results, out-of-term explanation and viewer refusal with zero writes (SSR snapshot supplied for the original registry; browser effects not exercised). No new browser/physical-device acceptance.

Release: fresh verified backup, isolated financial/access/restore/rollback gates and 112 built-candidate contracts passed. All 168 runtime files and 50 authoritative tables, keys/configuration and adjacent services were preserved. Public verification passed. No production financial edits or new browser/device acceptance claimed.
