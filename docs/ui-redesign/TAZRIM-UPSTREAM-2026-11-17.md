# Tazrim upstream review — 2026-11-17

Source: `JordanYefet/Tazrim` `main` at `ab9b479`, compared with the original fork point `7f3a9ed` (253 commits). Budgit remains a separate Node/React application with its own financial models, authentication, records, and release process. The current Budgit source is `work/budgit-household-ui`.

## Adapted in this checkpoint

- The phone navigation follows upstream's pages-only pattern. Budgit's five destinations are Home, Accounts, Planning, Goals, and Categories; Basic mode shows the four permitted pages. The `…` tab is removed.
- An account card in the header identifies the current account and offers report intake, upload, Settings, and guarded sign out. The card closes on outside interaction and Escape without a full-screen scrim.
- The desktop sidebar shows the same primary pages. Settings uses compact section tiles, with Help and a single searchable tool catalog. The catalog preserves all 27 previously linked advanced/native workflows and the former More-page destinations without duplicate routes.
- Rolling amounts follow the newer, slower digit cascade with brief motion blur. Reduced-motion preferences disable the blur and transform transition.

## Upstream changes requiring separate Budgit decisions

Upstream's new account login, bank scraper sync, profile/avatar system, privacy unlock, encrypted vault, settings updater, transaction bulk edits, and financial projections depend on its own server and data model. They cannot be merged into Budgit as presentation files. Budgit already supplies account isolation, its own vault, guarded refresh, report intake and financial commands. The upstream wallpaper gallery, period loading behavior, advanced mobile gesture animations, and account-page layout changes also need adaptation against Budgit's current screens and phone acceptance before release.

This checkpoint does not change saved records or API behavior. Upstream remains a reference, not a Git merge target for Budgit.
