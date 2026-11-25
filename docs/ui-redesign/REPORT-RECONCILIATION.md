# Reconciling overlapping reports

A file can repeat a previously saved transaction and add new evidence about it. Reconcile rows before deciding how the report changes the budget. Apply changes through the existing preview, explicit approval, source receipt, and revision-checked save.

## Match each occurrence once

- Scope comparisons to the selected budget and the actual bank account or card. For card statements, use the billing date to select the statement and the purchase date as evidence for each transaction.
- Prefer stable transaction references and exact saved identities. Corroborate with the provider, signed amount, currency, purchase date and merchant for cards, and the available reference and running-balance evidence for banks.
- Treat absent metadata as unknown. For a card row with missing installment or transaction-reference details, first match rows with exact evidence. Match a remaining pair only if it is one-to-one, purchase date, normalized merchant, billed and original amounts, currency evidence, and issuer agree, and the known installment and reference details are compatible.
- Preserve the multiplicity of repeated transactions. Show ambiguous or conflicting matches for review. A weak match must never consume a row already matched by stronger evidence.

## Keep, add, or correct

- A verified duplicate can finish as already imported. An overlap with additions keeps the confirmed rows and adds the new ones. Keep transaction IDs, classifications, splits, user notes, and links. On a guarded save, verified source evidence can supplement missing installment or reference details.
- An omission from partial coverage does not authorize deleting a saved row or treating the current period as fully covered. A Cal activity export that omits saved rows requires a complete billing statement before it can propose a correction.
- For a complete statement with unresolved differences, show the saved and incoming evidence and the proposed additions and removals. Require the existing explicit replacement decision and final save. If multiple files in one batch compete for the same card cycle or an overlapping bank period, keep the existing guard and review the authoritative source.
- Reconcile the card's applied rows in signed cents to the selected statement total. The card bill is counted once. Use the existing bank coverage, running-balance, and settlement safeguards. The final review shows which card rows stay, are added, or are removed, alongside the before and after bill amounts.

The regression tests in `test/statement-evidence-dedupe.test.mjs` cover a 31-row complete statement that extends a three-row legacy import, with all original IDs retained. They also cover ambiguous lookalikes, genuine repeats, and conflicting issuer evidence. Bank overlap tests live in `test/bank-import.test.mjs`.
