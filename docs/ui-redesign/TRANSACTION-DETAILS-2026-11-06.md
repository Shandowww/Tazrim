# Transaction evidence before classification — 2026-11-06

Native individual and grouped bank/card review now displays the existing reader’s transaction evidence before the type/category control: description or merchant, date, signed amount and direction, plus available details, beneficiary, purpose, reference, value date, notes, account/card, source filename, due date, balance and original card purchase amount. Absent fields are omitted; zero values remain visible. Groups show five rows initially and allow access to every row, with a focus-preserving collapse control. The UI explains when a choice applies to the entire group.

The shared presentation component reuses existing parsed rows. Classification handlers, optional card categories, saved progress, confirmation and financial commits retain their existing behavior.

Validation: final build/typecheck; 1,272 regression tests; 15 core checks; synthetic bank/card individual and grouped browser checks; 320/390/430px and desktop no-overflow checks; dark/reduced-motion checks; keyboard focus through expand/collapse; classification still works; private evidence refused to another actor. Synthetic plan/source bytes were unchanged by evidence inspection and local classification. No physical iPhone acceptance is claimed.

Published application `eb772e1` passed the complete release gates; see `evidence/release-transaction-details-2026-11-06.json`. This release also includes the already verified native Shortcut parameter corrections committed before this UI change.
