# Compact mobile Overview

Review-only application `0414b15`. Production promotion still requires Tal's explicit approval.

On phones, Overview begins with financial values. The eyebrow and visible page title are removed; a visually hidden heading retains screen-reader structure. Its month picker is now a compact native dropdown beside the budget selector in the app bar. Two or more budgets use a mobile dropdown with the actual shared-space name and viewer qualification. Desktop retains its existing title, month picker, budget switch and refresh control.

Report updating is removed from Overview (including the empty-state action) and is directly available in the phone More menu. Desktop retains the existing Reports workspace upload destination. More also contains app refresh and, when applicable, All spaces. Phone refresh moves out of the header; the same guarded refresh command and existing pull gesture remain. Extra vertical gaps in the phone Overview are removed.

The two month-picker placements reuse one component, the original history rows and query rules. Month, budget, scope guards, financial commands, theme, currency and forecast semantics are retained. No backend, financial-data or storage-model change.

Validation: build/typecheck, 1,458 regressions, 24 focused home/menu/outlook/refresh checks and 15 core checks pass. Browser checks cover light/dark at 320, 390, 768 and 1440px, native dropdown arrows, 44px controls, no horizontal overflow and desktop/mobile visibility. A disposable shared fixture verified month changes, personal/shared switching, viewer labels, report navigation and successful menu refresh retaining scope/period. Its financial bytes remained unchanged with zero financial writes (two nonfinancial requests were counted by the fixture). Hosted sample identity/revision and source hash are checked separately in the evidence JSON.

No new physical-iPhone, installed-PWA or physical pull-gesture acceptance is claimed. Existing pull/refresh regression contracts pass; the gesture implementation is unchanged. Production and adjacent service identities, frontend and health must remain unchanged during preview activation.
