# Apple Design revision of the adaptive preview

This redesign remains review-only. Tal's explicit approval is required before replacing the production interface. The preview source is isolated on `codex/platform-adaptive-ui`; production remains on its existing source and database.

## Interface

The desktop sidebar remains persistent and expandable. The working area now uses a quiet neutral backdrop, consistent edges, and a clear financial hierarchy: selected-month totals, recent history and category detail, then planning destinations. The history chart has a bounded height, shared scale, reported-only values, and keyboard-accessible month links. Category figures explicitly describe positive purchases before refunds; card charges remain a subset of overall expenses. Zero, refunds, missing reports and partial coverage retain their original meanings.

Phone layouts stack the same groups, retain the four main destinations and minimal Back chevrons, and show one editable form section at a time. Section controls stay within reach while scrolling. The Back chevron is at the RTL leading edge of the header, with a 44px target. Immediate press feedback, system typography, restrained translucent chrome, and reduced-motion/transparency/contrast preferences follow the requested Apple Design skill. No ornamental looping motion or new animation dependency is added.

## Navigation

The preview integrates current source `42f23a7` (application `70a302a`), including the completed scoped form-draft work. Recoverable input is flushed before navigation without requiring a financial save. Returning restores exact partial values. Existing unknown-mutation, unavailable-storage, destructive-action, viewer, scope and revision guards remain. This replaces the prototype's earlier baseline; it does not change production.

Browser acceptance exercises section changes, browser Back, the visible Back chevron, restoration of `12..`, resizing, sidebar links, keyboard access and root-tab gestures, with byte-identical synthetic financial records and zero financial writes.

## Preview isolation

`scripts/preview-platform.mjs` runs the real UI/commands against newly seeded synthetic records in an in-memory SQLite database. It does not load production secrets or databases. External login, incoming uploads, service-worker registration and PWA installation are refused in this review environment. The local preview remains available on port 5178.

`deploy/preview-platform.Dockerfile` can layer the review files onto an already verified existing runtime image. The temporary hosted preview uses a separate HTTPS hostname, a read-only container, bounded resources and no host data mounts. HTTPS permits the browser's existing encrypted device-draft APIs on phones; LAN HTTP is not a secure context. The production container, image tag, frontend, database and configuration are not replaced.

Tests and the hosted-preview receipt are recorded in `evidence/apple-adaptive-preview-2026-11-10.json`. Physical iPhone acceptance still requires Tal's device review. The branch must not be promoted to production without approval of the reviewed design.

## Untouched-page navigation repair

Following Tal's report that both the local and HTTPS previews could become stuck on untouched pages, a controlled stalled-IndexedDB experiment reproduced the trap on an untouched new-card editor. Initial device-draft loading was registered as an active financial save. Leaving the page opened a disabled saving/discard dialog even though no field had been edited; even reload raised a before-unload warning.

Initial draft reading is now separate from financial/local saving. An untouched editor can be left while storage loads or fails, retaining the existing stored copy. Edited input, unknown mutations and actual saves retain their existing protections. IndexedDB opening fails after five seconds or a blocked-open event, and any late connection is closed. Newly selected lazy screens show an explicit loading surface immediately, and another destination can interrupt a slow import without a late route jump.

Failure-injection browser checks cover leaving an untouched editor with a never-resolving storage open, the actionable timeout, navigation after storage failure, and switching destinations while a screen's JavaScript response is withheld. Existing draft restoration and zero-financial-write checks remain. Only the sample-data preview is updated; production approval is still required.
