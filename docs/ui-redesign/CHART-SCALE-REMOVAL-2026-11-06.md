# Remove the overview chart scale callout — 2026-11-06

Removed the standalone upper-scale value and its ambiguous monthly-amount label from the six-month overview. Bar heights, negative-value handling, selected-month totals, card-subset semantics and all financial calculations remain unchanged.

Build/typecheck, the 11 existing household-home contracts and 15 core checks pass. The prior 1,272 functional regression suite remains current for the financial models, which are unchanged. This bounded presentation removal adds no test mirroring its implementation.

Published application `e9c4b01` passed the release gates; see `evidence/release-chart-scale-removal-2026-11-06.json`. The owner-authorized read-only personal report audit is private and is not committed to either source repository.
