# Goal artwork and original repayment dates

Tal requested restoring the original filling-painting concept while keeping the Tazrim theme, plus full loan terms from their first repayment month. Sites is retired from the publication workflow; Hetzner remains the active host.

Both interfaces now share the original nine CSS illustrations, part definitions and artwork-bound fill mapping. React goals use confirmed allocated balances, including stored deposits, without counting planned pace or estimated interest. Future snapshot bases stay unfilled and do not expose confirmed progress. The visual library uses labelled keyboard-accessible buttons and existing guarded metadata saves; amounts, allocations, reports and histories are untouched by illustration selection.

Loan inputs describe the first repayment month and total inclusive number of repayments. The original setLoan/scheduledLoans model now accepts a first repayment before the budget start, retaining the full term and projecting only repayments within each forecast month. Actual reports remain unchanged. Existing stored dates/counts are never inferred or migrated. The 120-payment and budget-horizon upper bounds remain; dates use the existing 2000–2099 validator. Both original and native forms use the same semantics.

Validation: build/typecheck; 1,095 regressions; 15 core checks. Added a regression for a historical first month, full inclusive end, remaining forecast, completed historical loans, edit/reload preservation and untouched actual reports. Original artwork-fill regression and original-interface VM contracts run against the shared artwork.

Synthetic browser checks: empty/25%/complete paintings; nine-picture library; keyboard focus; unsaved navigation; lost-response metadata save/retry with one PUT; 320/390/1280/1440 widths without document overflow on the checked screens; Light/Dark appearance. Native keyboard month entry saved March2025/40 payments/₪1000 through June2028/₪40000 and retained it after reload. Browser DOM fill for the native month control did not update React; native keyboard input verified the actual control. No production financial records were edited.

Sites lookup: historical project appgprj_6ac15fd9d7708191965b3d0d6f7ea72b returned NOT_FOUND. Owner listing exposes only the separate older Site, which was untouched. No deletion tool is available; actual hosted deletion is unconfirmed. Historical identity remains source provenance/build protection only.

Operational rollback: after a user saves a newly supported pre-budget loan date, earlier application validators reject that plan. Any later rollback must retain this validator compatibility; do not rewrite or restore financial records to fit an old image. Immediate release rollback remains available before such writes.

Release: application c7f9608 is verified live. Shared viewer check refused editing without illustration buttons; Bob/shared revisions remained unchanged while Alice performed synthetic saves. Exact runtime and preservation receipt: release-goals-loans-2026-11-01.json.
