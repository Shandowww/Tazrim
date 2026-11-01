# Specific-loan repayment evidence and home-screen launch

Tal requested choosing a historical bank transaction as a payment to a specific loan and recognizing later monthly occurrences. Tal clarified that deductions are against the planned repayment total, not the bank's outstanding principal or interest.

## Shared original behavior

Original loans now optionally retain `repayments:{version:1,keys,ignored?,rule?}`. Each payment reference binds the existing bank movement key, fingerprint and account ID. Recognition requires a single matching loan, its current paying account, exact normalized description/beneficiary and sample debit amount, and a date within its original inclusive term. Changed amounts/accounts, reversals and competing loans do not silently match. Explicit reviewed bank classifications take precedence. Existing keyed evidence stays attributable after a future payer change, while the old future rule becomes inactive. Original loan edits retain this metadata.

Both original and native bank previews/imports call the same model. Accepted imports append stable evidence references inside the existing atomic plan/source/receipt transaction. No financial engine, bank connection, background job or provider permission was added. Duplicate imports cannot credit a payment twice. Source undo makes absent movements stop contributing; reimport reuses the same evidence identities. Explicit ignored references prevent automatic reassignment after an unlink. Stopping a rule retains already identified payments.

Manual linking can move an already reported variable/transfer/cheque expense to loan repayment in integer cents, preserving total expense, net cash flow and bank balances. This requires complete actual aggregate/account records, sufficient source expense and fully sourced existing repayment totals. Unsourced/manual repayment amounts, partial reports, savings/card classifications and protected reconciliation conflicts require source/monthly review. Source keys, fingerprints, raw source fields, original batch snapshots and stored report bytes stay intact. Existing bank-undo guards continue to refuse undoing manually altered monthly reports. An unlink changes attribution only; it does not remove the expense or undo its category correction.

The native loan list/editor opens `/next/loans/:id/payments`: planned total, net identified payments, amount not yet identified, source history, one-payment confirmation, future matching, unlink and stop recognition. Earlier elapsed months are not assumed paid. Forecast dates/term remain the original loan schedule; this feature does not calculate principal, interest or amortization. Refund evidence is assigned explicitly. Owner/editor writes use the existing actor/space/revision-bound save path and stable same-action retry; uncertain results freeze choices. Viewers get a scoped read-only summary. Vault storage uses existing encryption without new plaintext disclosure.

## Home-screen correction

Existing bare-root GET/HEAD launches redirect without caching to `/next`; explicit query-bearing original-interface bridges remain available and now retain their exact local destination through login. The shared manifest keeps its original ID/scope but starts at `/next`; native HTML includes the existing touch icon and standalone metadata. An already-running phone page may need one refresh/reopen. Real iPhone OS launch behavior was not directly operated or claimed.

## Verification

Build/typecheck;1,108 regressions;15 core checks. New contracts cover signed evidence/refunds, immutable source identities/cash totals, strict matching/ambiguity/manual override, undo/reimport/ignored records, actual native CSV intake and the original atomic report service with one successful commit despite a lost response, saved report resume, plan-save recovery, viewer refusal/private isolation, encrypted metadata round trip, source-account changes and original loan-edit preservation. Home-screen contracts cover root GET/HEAD/no-store, public installation metadata, exact deep login and retained original entry points.

Synthetic browser: root-to-native launch,320/390px and1440px, Light/Dark, correct₪1000 identified of₪3000 with₪2000 not yet identified, unsaved navigation, uncertain-action lock and one-PUT retry recovery. Overview stayed at₪1000 spending/−₪1000 net after classification. Bob/shared revisions stayed unchanged; a shared viewer saw zero identified in its own scope and no edit controls. Original phone data and production records were not edited during acceptance. Remaining real-device/platform/provider limits stay explicit.

After users create bindings, a later runtime rollback must preserve their evidence and matching behavior; never restore financial records merely to fit an older interface.

Applicationcd0ee85 is verified live. Content-free runtime, backup/preflight and unchanged-record evidence: release-loan-payments-2026-11-01.json. No live payment was selected or financial record changed on behalf of the user.
