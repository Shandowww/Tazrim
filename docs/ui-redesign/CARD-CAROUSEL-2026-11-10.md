# Card carousel refinement — 2026-11-10

Application `3af797b` is verified live on `codex/budgit-household-ui`. Evidence: `docs/ui-redesign/evidence/release-card-carousel-2026-11-10.json`. The previous live application was `3946e92`.

## Existing model and bounded change

`householdAccounts` continues composing `budgetAccountOverview` and `budgetDetailView` without writes. The existing `selectedWalletCard`, `nextWalletCard` and `walletSwipe` retain selection validation, modulo wrapping and horizontal gesture thresholds. No accounting, report matching, saved metadata or financial commands change.

- Each card face shows its existing selected-period total instead of its display name. Reported zero and signed refunds stay monetary amounts; missing evidence says **טרם נקלט חיוב לחודש זה**, or **טרם נקלט חיוב לשנה זו** for annual selection. Names remain in the selected card's accessible label, selector controls and detail heading.
- Cal moves to the physical lower-left mark group, aligned with the existing network mark position. Network evidence is retained, including when a Cal card also has an explicit network. Other issuer and paying-bank marks retain their positions.
- Only the duplicate selected-card total is removed from the category heading. Category amounts, refunds, coverage/remainder disclosures and the aggregate all-card total remain unchanged.
- Side cards are upright and the same size as the center card. Adjacent buttons, dots, keyboard arrows and swipes use the same 260ms transition; reduced motion selects immediately. Direct nonadjacent dot selection remains immediate rather than animating through unrelated cards.
- Both adjacent positions exist with two cards. Decorative, inaccessible outer copies maintain edge continuity during either transition; keys identify positions rather than duplicated card IDs. Single/empty-card views do not render side copies.
- Existing query scope/period, remembered selection, route state, vertical-position preservation and 44px selector controls remain. Pending transitions reject overlapping navigation and cancel on query/plan/scope change or unmount. Vertical, short and cancelled gestures do not select another card.

## Verification

`test/household-accounts.test.mjs` covers original-model parity, unchanged source data, signed amounts, missing evidence, two-sided neighbors and 101 repeated wraps in each direction.

`test/household-card-carousel.test.mjs` bundles the actual page with the existing esbuild dependency. Static React rendering checks charges, category amounts, Cal position, side copies and zero/one-card views. A deterministic hook/DOM-boundary harness invokes the actual handlers for repeated buttons/dots, reduced motion, cancellation, horizontal/vertical/short gestures and preserved navigation options. CSS contracts check upright cards, RTL-independent mark placement, outer-copy spacing and reduced-motion rules. This is not browser or physical-device acceptance.

Validation commands:

```sh
node --test test/household-accounts.test.mjs test/household-card-carousel.test.mjs
node build.mjs
node verify.mjs
node --test test/*.test.mjs
git diff --check
```

Results: 12 focused checks, all 1,318 regressions, build/typecheck and 15 core checks pass. `git diff --check` passes. Vite retains its existing warning about chunks larger than 500 kB; no new dependency or bundle-splitting work is introduced.

## Remaining limits

No new browser or physical-iPhone visual/touch acceptance. Publication passed fresh verified backup, isolated preflight, rollback and runtime-verification gates, preserving all 50 authoritative tables, configuration/keys and adjacent services. No financial records, Sites or hosting resources were changed. The completed source is backed up to GitHub; existing browser/PWA sessions need guarded refresh after saving drafts. Outer-checkout WIP and the active checkout's pre-existing `scripts/__pycache__/` are preserved.
