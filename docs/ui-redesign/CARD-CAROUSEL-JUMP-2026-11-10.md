# Carousel end-of-transition flash — 2026-11-10

Follow-up to application `3af797b`, using the user's supplied iPhone recording. The transition briefly showed the previous card again before settling on the new one. The recording and extracted frames stay in ignored local work, not Git.

## Root cause and bounded correction

The old completion callback reset the shared translation before React Router committed the new `walletCard` selection. An outer `flushSync` did not make the router's deferred update atomic. The reset also re-enabled transitions in an animation frame without first flushing the disabled-transition zero position, allowing a reverse transition to flash the previous face.

The original query-based selection and original financial composition remain. Completion now requests the selection while keeping the incoming card translated in place. A layout effect resets only after the new route/plan is rendered, with transitions disabled; a layout flush commits zero before transitions are re-enabled. Pending route commits refuse overlapping selections. No financial, report, issuer or category logic changes.

Browser verification also reproduced a separate vertical jump: the router had stored different scroll positions for each `walletCard` query. Only `/accounts` now excludes `walletCard` from its opaque scroll-key identity. Actor, budget, period, account/filter and other routes remain distinct; private route data still never becomes the stored scroll key.

## Verification

- Deterministic actual-handler test delays router commits, checks that the translated incoming face stays in place, refuses overlapping selection, then verifies zero is flushed with transitions disabled and the current vertical position is restored.
- Existing swipe, wrap, cancellation, keyboard and reduced-motion tests remain. A separate scroll-query contract checks that only card selection shares a scroll position, not another space, month, year, account/filter or route.
- Synthetic shared-browser probe at 402×874 sampled eight two-card light-theme transitions (221 animation frames), both directions, and four dark-theme transitions. Every sequence changed card identity once, without a previous-card reappearance. Light transitions settled at x=44.22265625px; light and dark probes retained scrollY=150 without horizontal overflow. An earlier three-card probe also showed one identity change per transition.
- Browser probes use only the built-in synthetic demo, with the card list narrowed in memory for the two-card case. No authenticated production session or financial API writes were used. This is not a new physical-iPhone acceptance claim.

Application `f7bf3ba` is verified live. Clean archive build/typecheck, 1,320 regressions, 15 core checks and 23 focused contracts pass, together with 135 isolated built-candidate contracts and all release/rollback gates. All 50 authoritative tables, configuration/keys and adjacent services were preserved. Full release evidence: `docs/ui-redesign/evidence/release-card-carousel-jump-2026-11-10.json`. Save drafts and use guarded refresh in browser/PWA. No physical-iPhone retest or production financial changes are claimed.
