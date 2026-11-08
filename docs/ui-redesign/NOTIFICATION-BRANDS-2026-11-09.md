# Notification labels and bank/card marks — 2026-11-09

The bell dialog, full notification page, related links and screen-reader labels now say **התראות** in both interfaces. Actual report-work states still describe reports awaiting action.

The official Hapoalim SVG was already bundled locally; legacy accounts with a bank name only in their display label did not select it. A read-only display adapter now recognizes unambiguous bank labels, while explicit bank metadata wins. Hebrew/English ONE ZERO aliases resolve the local logo. Its card program is recognized by the explicit card name or existing linked ONE ZERO payer, separately from the processing issuer recorded by imported reports; saved provider metadata takes precedence. Other conflicting issuers retain the prior generic fallback.

The household card face now includes the existing payment-network mark at its lower left, with an accessible name. Saved networks take precedence; named Mastercard cards and the requested ONE ZERO card display Mastercard. Unknown networks stay unknown. The original payment-card component already uses the same published marks. No financial amount, payer link, source record, stored card metadata, theme or navigation behavior is changed by these display adapters.

Application source: `5648a242856d052c824e16811a12668bb459d047` (implementation `418f7cb`). Build/typecheck, 1,346 regressions and 15 core checks pass. The three added contracts cover legacy bank labels, conflicting names, metadata precedence, ONE ZERO/processing-issuer coexistence, explicit networks and input immutability. Static React rendering also verifies local Hapoalim/ONE ZERO alias images and the existing Mastercard artwork. No new browser or physical-iPhone acceptance is claimed. Publication is recorded separately.

Publication: the same application commit is live. All 167 runtime files match; all 50 authoritative tables, configuration keys and adjacent services were preserved. Health/access/deep-route checks passed. Release evidence: `evidence/release-notification-brands-2026-11-09.json`.
