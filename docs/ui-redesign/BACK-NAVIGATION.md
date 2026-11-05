# Back navigation — 2026-11-05

## Design decision

Use a compact circular chevron on the leading edge for the main Back control. In Hebrew RTL it points right. A 44 × 44 CSS-pixel touch target, screen-reader name, desktop tooltip, visible keyboard focus and restrained press/hover feedback make it usable without adding visual weight. Light/Dark appearance follows existing theme tokens; reduced motion disables transitions.

Contextual return links (for example, returning to planning or a bank-update screen) retain their readable destination text and use the same chevron and comfortable touch spacing. Confirmation cancellation and wizard step controls retain their distinct existing behavior.

The shared BackLink delegates navigation to the original Link boundary. Existing destinations, trail replacement, period/space query, mode filtering, roles and unsaved-edit protection are preserved.

## Official guidance checked

Apple’s current toolbar guidance recommends standard recognizable Back and Close symbols, consistent appearance, and a circular symbol-only main Back control. Its RTL guidance explicitly mirrors Back to point right. This is a web implementation using the app’s existing design tokens, not a native system toolbar.

- https://developer.apple.com/design/human-interface-guidelines/toolbars
- https://developer.apple.com/design/human-interface-guidelines/right-to-left

Retrieved 2026-11-05 from Apple’s official Markdown documentation endpoints (`toolbars.md` and `right-to-left.md`). No claim of a separate audit of third-party apps is made.

## Acceptance

Build/typecheck, 1,162 regressions and 15 core checks pass. Synthetic Chrome at 320/390/1440 CSS pixels checks the menu location, Basic calculator, main Back target size and accessible name, keyboard activation, Light/Dark/reduced-motion styles, dirty-editor stay/discard behavior, shared-space/month return, no overflow, and unchanged financial hashes. The 390px Light/Dark screenshots were visually inspected. Fresh physical iPhone Safari acceptance is not claimed.

Evidence: `evidence/menu-calculator-back-browser-2026-11-05.json`.
