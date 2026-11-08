# Issuer notices, card marks and partial-report wording — 2026-11-09

Salary transfers were falsely classified as promotions because the original classifier matched `מבצע` inside the transfer actor field `המבצע:`. Transaction rows, structured payroll/balance records and transaction-table continuations now stay outside issuer notices. Actual offer wording, including `מבצע:` and `תנאי המבצע:` with original/discounted prices, remains supported.

Credit-limit changes, interest changes, earned/balance points and club benefits have distinct Hebrew labels. Limit/rate changes retain the existing attention behavior; points and club benefits remain informational. Original text, explicit dates, amounts and page links remain available for checking. Cal extraction retains its existing physical message-section boundary; it does not turn transaction rows or unrelated advertising into notices.

The existing notice service revalidates earlier encrypted scan discoveries when reading them. This hides payroll false positives and reclassifies valid older messages without rewriting scan ciphertext, revisions, source records or financial records. The corrected count feeds both the notices page and notification facts. New scans continue through the original actor/scope/source-hash/revision/consent guards.

The household card now places the paying bank at the top and the processing issuer at the bottom, next to the existing payer description. Mastercard and other saved network marks remain at the bottom. A separate read-only issuer helper retains original report evidence even when the card program is bank-branded, such as ONE ZERO. Unknown/conflicting issuers remain unknown; no payer or stored card metadata changes.

`נקלט חלקית` replaces `עוכל חלקית` in the Sync Center filter, shared lifecycle label and guided-review summaries. Internal lifecycle values, progress, final confirmation and retention rules are unchanged.

Application source: `86f485774629c8f315a20a71d23c3c5d8ca65456` (initial notice repair `a3c53eb`). Build/typecheck,1,352 regressions and15 core checks pass. Six added contracts cover salary/actor rejection with real-offer retention, four notice categories and action titles, real Hebrew/Cal PDF bytes with unchanged financial parsing, legacy encrypted-scan read-only correction and separate bank/program/issuer evidence. No new browser or physical-iPhone acceptance is claimed. Publication evidence is recorded separately.

Publication: the same application commit is live. All167 runtime files match; all50 authoritative tables, configuration keys and adjacent services were preserved. The actual-backup read-only check filters the reported payroll false positive. Public health/access/deep-route checks pass. Evidence: `evidence/release-issuer-notices-card-labels-2026-11-09.json`.
