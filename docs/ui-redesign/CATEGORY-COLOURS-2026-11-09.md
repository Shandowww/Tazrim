# Distinct category and subcategory colours — 2026-11-09

## Distinct category colours published — 2026-11-09

Application `3946e92` is verified live at `https://budgit.duckdns.org/next/categories`. Automatic colours now follow the complete category identity, separating subcategories instead of reusing their parent tone. The 16 pictured categories and all built-in categories have distinct automatic colours. Added root tones and light/dark lightness levels retain readable labelled charts. Filtering, amounts, renaming/moving/merging and unrelated category additions do not change the colour; explicit personal colours retain precedence. No saved categories, source labels or financial records are rewritten.

Clean archive build/typecheck,1,310 regressions,15 core checks,four new colour contracts and133 built-candidate contracts pass. All512 prior-source and169 candidate/live runtime files matched. Fresh verified SQLite backup, isolated financial/access/source-decryption/startup/rollback/intake/automation restore and70 retained-asset checks passed. Activation preserved all50 authoritative tables, configuration keys and adjacent services; public health/auth/category/deep routes/root/manifest/installer pass. No new browser/physical-iPhone acceptance, Sites change or resource upgrade. Save edits and use guarded refresh. Evidence: `docs/ui-redesign/evidence/release-category-colors-2026-11-09.json`. Continue in `work/budgit-household-ui`.

## Existing implementation

`frontend/src/app/household-categories.js` remains the shared presentation adapter used by the category donut, legend, net list and other household category surfaces. Root semantic tones are retained and expanded; subcategories use a deterministic full-label palette with theme-specific lightness tokens in `frontend/src/app.css`. Original registry aliases preserve identity, while custom saved hex colours retain precedence. No backend, schema, API or persistence changes are required.

`test/household-category-colors.test.mjs` covers all built-in categories and the reported screenshot, ordering/filter/data independence, registration/rename/move/alias/custom-colour preservation and complete light/dark CSS token coverage. Existing household and category-management/registry tests retain merge and custom-colour contracts.

This is not a claim of colour-blind-safe identification for every possible category set: category names and values remain essential. No browser or physical-device visual acceptance was performed for this release.
