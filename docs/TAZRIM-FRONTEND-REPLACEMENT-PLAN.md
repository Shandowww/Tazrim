# Budgit frontend replacement using Tazrim

Status: implementation plan only, prepared 2026-10-26. No implementation or deployment is authorized by this document alone beyond the user's standing instructions. This turn requests planning, not execution.

Target implementer: **GPT-6.1 Sol (`gpt-6.1-sol`), medium reasoning**. Work sequentially, one numbered task at a time. Do not spawn agents unless Tal requests delegation. Model selection must be set in the execution chat; this file does not change its model.

## Outcome and constraints

Replace Budgit's presentation with the actual Tazrim React components and design, retaining **Budgit's name, logo, backend, records, calculations and established workflows**. Tal has the creator's permission. Keep MIT/OFL notices in source and acknowledgements; do not label the interface “בהשראת”.

Visual fidelity means retaining Tazrim's markup, typography, tokens, spacing, materials, charts, responsive layouts and interactions wherever the two products share a screen. Budgit-only workflows use those same components and design rules. Differences required by Budgit's financial semantics must be explicit, not hidden by misleading labels or fabricated data.

This is a frontend replacement, not another CSS theme or a migration into Tazrim's database. Keep the existing interface available as a fallback during development and rollout. Do not remove its per-device selection without a later explicit decision.

## Source baseline: verify before editing

- Canonical repo: `/Users/talshandor/Documents/personal-projects/monthly-flow`.
- Read `AGENTS.md`, `README.md`, `PROJECT-HANDOFF.md`, `APP-GUIDELINES.md` and this plan.
- Tazrim reference: `https://github.com/JordanYefet/Tazrim`, inspected commit `7f3a9edb60f1c1a723213049f20d9b5869fc599e`, local clone `/tmp/monthly-flow-tazrim-reference`. Pin this commit for reproducibility; do not silently follow upstream changes.
- Canonical HEAD when planning: `3c1bc74fea923e9836420da6abc31d4a3cad2bce`. There are substantial unrelated working changes and newer private/shared-space features. Reinspect before work; do not reset or commit the entire working tree.
- Last release recorded by this chat: `a79488ba465e6061edeb542aa22e40b852489631`, initial theme. Verify the actual server release before preparing a deployment; other work may have advanced it.
- Previous handwritten display candidate: `3e53c78f82867d3ced03c3e7f398276993c0d542`, branch `codex/tazrim-display-rebuild`, isolated checkout `/tmp/budgit-tazrim-release`. Subsequent bank-empty-state, demo-navigation and notification fixes are uncommitted there. That candidate's 562 passing tests are historical evidence, not validation of the replacement or latest canonical source.
- Preserve the canonical working-tree deletion of `public/shortcuts/budgit-apple-pay-ios27.shortcut` and unrelated Shortcut work. Resolve release packaging from the agreed baseline; never silently restore the file in the user's working tree.
- Keep `SOURCE-OF-TRUTH.json` and historical Site identity. Production destination is `https://budgit.duckdns.org` on the existing server. **Leave Sites unchanged.**

## Architecture decision

Use **React + TypeScript + a static Vite build**, with Tazrim's actual TSX components, Tailwind styles, Radix primitives, Lucide icons, Recharts and locally hosted Heebo fonts. Serve the built assets and application shell from Budgit's existing Node server behind its current authentication. No additional production process, Prisma database, Next server, hosting subscription or resource upgrade.

Tazrim uses Next.js server pages, database queries and routing hooks. Retain its presentation source; adapt the framework boundaries deliberately:

| Tazrim dependency | Budgit replacement |
| --- | --- |
| Server pages and `lib/db/*` queries | Client page containers reading authenticated Budgit state through typed adapters |
| `next/link`, pathname/search/router hooks | Explicit imports from one Budgit navigation module backed by React Router; every transition uses the common draft guard |
| Server cookies for period/sidebar | Device presentation preferences, scoped by identity/space where appropriate; no financial records in cookies |
| `next/font` and metadata | Local fonts, existing Budgit icon/manifest and equivalent document/theme metadata |
| Prisma types in visual components | Local presentation types, with provenance and null/missing-data support |
| Tazrim import/save/delete APIs | Existing Budgit commands and authenticated endpoints, preserving their validation and save conventions |

Do not create pretend `next/*` aliases or rewrite components into HTML strings. Retain source file structure where practical and record adapted files in a provenance manifest. Existing `src/tazrim-display-model.js` is a reference to audit, not a trusted replacement for Budgit's calculations. Do not load `src/tazrim-display.js` or its overriding stylesheet into the new React root.

Proposed layout:

```text
frontend/
  package.json, lockfile, tsconfig.json, vite.config.ts
  src/main.tsx
  src/app/                 # routes, providers, navigation, error boundaries
  src/tazrim/              # actual source components, hooks and styles
  src/budgit/api/          # authenticated transport and existing endpoint contracts
  src/budgit/state/        # session, space, loaded revision, draft, save state
  src/budgit/adapters/     # pure read-only view models
  src/budgit/commands/     # validated existing operations
  src/pages/              # page composition and Budgit-specific screens
  test/fixtures/          # synthetic records only
docs/tazrim-migration/
  checkpoint.md, provenance.json, feature-parity.md, api-contracts.md, acceptance.md
```

Existing pure JavaScript financial modules remain authoritative and are imported through a narrow boundary. Separate DOM-dependent client behavior from state transitions in small tested extractions; do not translate financial formulas into TypeScript anew. Keep the current backend API unless a documented compatibility gap demands a small, independently tested change.

## Non-negotiable behavior

- Monthly totals remain authoritative; imported rows explain them. Never add card breakdowns to bank payments again or require individual transaction tracking.
- Retain actual versus forecast, missing versus zero, signed refunds, balance dates, account/card IDs and partial-report warnings. Do not turn missing data into a zero or estimate into an achievement.
- Preserve incoming/outgoing internal-transfer classifications, savings contribution scope, installments, fees and existing cash-buffer decisions.
- Explicit budget saving stays explicit; appearance preferences apply immediately. Preserve revision conflicts, failed-save recovery, encrypted drafts and unsaved changes.
- Preserve identity and space isolation, viewer restrictions, vault encryption, access revocation, history, report protections and existing integration credentials. Decrypted vault data and keys stay client-side under the existing rules.
- Clear private state on logout, identity/space change, vault lock or revoked access. Cancel/ignore stale requests so a late response cannot populate another space.
- Hebrew/RTL, isolated financial values, System/Light/Dark, touch use, safe areas, keyboard access, reduced motion, pull-to-refresh and desktop refresh remain supported.
- Errors must be visible above navigation and active dialogs, accessible to screen readers, and actionable. Ordinary untouched demo data must not trigger unsaved-edit warnings.
- An empty bank list needs an honest empty state and a working setup action. Preview fixtures must include bank accounts as well as cards; no fake accounts in real budgets.
- Preserve existing scope limitations: a read-only account migration review must not become an account-move action. Do not turn unfinished features into claimed production capabilities.

## Execution tasks

Each task ends with focused checks, a reviewable diff and a checkpoint update. Commit only task-owned changes when the working-tree situation permits. Do not bundle all stages into one rewrite.

### 1. Freeze scope and build the feature inventory

Inspect current Git/worktree state and relevant active artifacts. Record the baseline, existing modifications and intended files. Use a `codex/` branch or an isolated managed worktree when needed; keep the canonical repository authoritative. Do not reuse the older display candidate as the new backend baseline without reconciling newer features.

Create `feature-parity.md`: one row per user-facing workflow, current implementation/test references, current release status, planned React route, read/write permissions and completion evidence. Distinguish live features, completed-but-unpublished work and incomplete work. Inventory all navigation/actions, not just the dashboard.

Required rows include onboarding; account/space selection; combined overview; bank/card setup; monthly reporting; balances; details/categories/cheques; plans/installments/scenarios; savings/goals/investments; loans; report center/review/resume/undo; saved reports; history/recovery/export/import; encryption; sharing/viewers; transfer matching; migration review; Gmail/Apple Pay/Shortcuts/backup/notifications where currently implemented; and all settings. Existing integrations must remain reachable and retain current behavior.

**Gate:** Every existing entry point maps to a destination or a documented pre-existing limitation. Record the release baseline policy so the final deployment neither downgrades production nor silently includes unrelated unfinished work.

### 2. Bring in the real frontend source and a reference fixture

Copy the needed source at the pinned Tazrim commit, preserving licenses and paths in `provenance.json`. Include components/styles/hooks and relevant pure presentation utilities, not its database, API handlers, private files or runtime seed database. Pin a compatible dependency set and lockfile; check official package documentation/advisories when selecting versions.

Create the React build in `frontend/`. Adapt framework imports explicitly. Establish a static synthetic fixture with named banks/cards, zero/missing/refund/partial cases and stable dates. Use the same synthetic values for visual comparisons with the pinned reference. Never copy live records into fixtures or Git.

**Gate:** Build, typecheck and a standalone local shell succeed. It renders actual Tazrim components with Budgit branding and no Tazrim database dependency.

### 3. Prove hosting and authentication with one read-only page

Add an opt-in authenticated preview entry such as `/next/`, and a narrowly scoped asset prefix such as `/ui-assets/`; retain `/` and current interface. Match static/deep routes explicitly after authentication; do not swallow `/api`, OAuth, import, health or other existing routes with an SPA fallback.

Serve generated assets safely with correct MIME types, hashed asset caching, no-store HTML/private responses and existing security headers. Include the new source/manifest in the content-derived build identifier. Confirm current CSP supports the bundled UI without broad script allowances; replace incompatible style mechanisms narrowly if required. Update local preview/build/Docker packaging while preserving source identity checks and importer assets.

**Gate:** One read-only dashboard loads through real Budgit auth and API contracts. Anonymous/forged identity requests remain denied; expired sessions show login, not stale private data. No new production service or database is introduced.

### 4. Establish state, adapters and the navigation contract

Document actual API methods, responses, revisions, errors and permission behavior in `api-contracts.md`; derive them from existing handlers and tests. Implement shared session/space/loading/error state, read-only view adapters, cancellation, request identity and revision tracking.

Build one navigation guard covering links, year/month/account/card selection, browser back/forward, space changes, refresh and unload. Track real draft changes, not merely a nonempty form. Include scenario/month/detail/cash/security/item drafts. Preserve existing save/discard/cancel semantics and recovery; never auto-save on navigation. Put notifications/dialogs in a consistent accessible overlay system and verify stacking above native modal dialogs.

**Gate:** Contract tests cover null/zero/refunds, actual-only totals, combined/account scope and double-count prevention. Navigation tests cover untouched demo, real edits, cancel, conflict and stale responses after switching space.

### 5. Complete shared Tazrim screens with real Budgit reads

Wire the actual sidebar, collapsed flyouts, header, period picker, bottom navigation, More sheet, dashboard summary cards, charts, bank/card lists and account details. Adapt labels/availability to Budgit meanings. Keep original chart markup and styling while changing the supplied data. Disable or replace unsupported upstream actions with meaningful Budgit actions; no dead links.

Implement category/detail drill-down, source-report views, real empty states and accessible search covering the documented supported destinations/data. Do not imply transaction search if only navigation search is wired. Do not import upstream recurring/unusual detection as new financial logic; use existing Budgit data or omit unsupported widgets with a documented reason.

**Gate:** Side-by-side desktop/mobile light/dark comparisons with identical fixture values. Banks/card menus, periods, drill-down and back navigation work. Document every intentional difference.

### 6. Port one complete edit-and-save workflow

Start with monthly reporting. Extract existing draft/validation/command behavior incrementally; use the original financial modules. Render editors with Tazrim primitives. Include input parsing, untouched/zero distinctions, validation, explicit save, in-flight status, actual success, retry, conflict and recovery.

**Gate:** A synthetic load → edit → save → reload cycle matches the current application. Simulated concurrent update cannot silently overwrite. Failed saves retain edits. This establishes the pattern for subsequent write screens.

### 7. Port planning, accounts, savings and goals

Use separate small commits/checkpoints for (a) account/card setup and cash balances, (b) planned items/installments/calculator/scenarios, (c) savings/goals/investment deposits, (d) remaining details/cheques/loans and related screens from the inventory. Reuse the command/state pattern from task 6.

**Gate per group:** Old/new command results are equal for the same synthetic inputs; account scope, contribution meaning, fees, refunds and installments retain their existing tests. No forecasts become completed progress. Navigation protects active drafts.

### 8. Port report workflows and existing connections

Migrate report intake, parser selection, review, classification, duplicate/partial handling, staged/unfinished reports, apply/undo and report history. Keep Budgit's parser pipeline and existing worker assets. Maintain destination-space labels before file selection. Migrate integration settings and installation/help flows using existing endpoints and credential handling; do not reconnect live accounts for visual testing.

**Gate:** Synthetic import → review → apply → undo and resume workflows pass, including failure/duplicate cases. Existing supported source formats and authenticated external ingestion routes still work. No private report contents appear in screenshots/logs/fixtures.

### 9. Port private/shared spaces, security and remaining settings

Migrate identity display, ownership/viewer controls, invitations, space overview, vault unlock/lock/recovery, export/import, history and existing transfer/migration-review workflows at their recorded implementation status. Use existing encryption modules directly. Complete all remaining inventory rows, appearance/device settings and guarded refresh.

**Gate:** Two synthetic identities and multiple spaces retain isolation; viewer writes fail; revocation clears displayed data; locked spaces expose no records; stale requests cannot restore revoked data; encrypted values/keys are not sent to new server endpoints. Existing restriction and recovery tests pass.

### 10. Remove migration bridges and finish parity

A temporary explicitly labeled link to the old interface may keep unfinished flows usable during development. It is not completion: replace it for every in-scope workflow before declaring the frontend ready. Do not embed old pages in iframes, mount two apps against shared globals, or re-skin legacy DOM as the final solution.

Keep the old interface separately selectable for fallback. Stop loading handwritten Tazrim shim code in the React interface; retire obsolete prototype code only when its useful fixes/tests have equivalents and no existing selection depends on it. Preserve original user preferences rather than silently changing a device's selection.

**Gate:** Feature inventory has no unexplained missing routes, incomplete write flows or silent fallbacks. Budgit branding/manifest/build ID are correct. New screens consistently use Tazrim components/styles.

### 11. Release acceptance

Run current full backend/model regressions, the new frontend typecheck/build and meaningful component/integration tests. Existing commands include `node build.mjs`, `node verify.mjs`, `node --test test/*.test.mjs`; update/document build orchestration for the new frontend without weakening checks. Do not carry historical test counts forward as proof.

Browser acceptance uses the authorized browser tool. Previously it returned “Local browser use is disabled in Work settings” even after Tal enabled access: retry normally, do not bypass it with another browser automation mechanism. If blocked, finish independent checks and mark visual acceptance pending honestly.

Check widths 390, 430, 768 and 1440 pixels plus narrow 320px overflow, light/dark/system, keyboard/reduced-motion, long Hebrew names and empty/loading/error states. Verify signed amounts, chart axes/tooltips, safe-area mobile controls, top-layer notifications, dialogs, scroll/pull-refresh, history, account/card menus, save conflicts and original-interface fallback. Record screenshot paths and differences against the pinned reference, using synthetic data. Device emulation does not count as a real iPhone check.

**Gate:** `acceptance.md` lists exact commits, tested features, commands/results, visual evidence, intentional differences and unresolved limitations. No claim of exact visual completion without comparison evidence. Any release baseline advances must rerun affected regression checks and preserve newer live features.

### 12. Publish the accepted build under the standing deployment authorization

Implementation execution may proceed to publication under Tal's existing authorization when all gates are satisfied; no repetitive approval request is needed. This planning-only turn does not deploy anything.

Verify current live release again. Prepare an exact source commit and archive including required frontend lockfile/build inputs; exclude databases, credentials and private reports. Push the same source commit to GitHub using `github-personal` SSH. Build on existing resources and verify package/runtime hash; if resource limits prevent it, stop and report rather than buy/upgrade hosting.

Before activation: fresh verified SQLite backup, isolated financial preservation/access/HTTP recovery preflight using existing scripts, rollback image and source archive. Update only Budgit on the existing server. Verify runtime build hash, health/login, unauthenticated and forged-identity rejection, private no-store behavior, new assets/deep routes and existing integrations. Verify the parking service is unchanged. Sites stays unchanged.

Record release/rollback identifiers and results. The rollback must restore the previous application against the unchanged database; if any schema change became necessary, redesign/review that separately before deployment. Keep the old interface fallback available during rollout. Do not describe an unactivated candidate as published.

## Checkpoint discipline for Sol medium

At each checkpoint record: task number/status, exact baseline/current commit, touched files, checks actually run/results, remaining risks, next bounded action and any decision changed with its reason. Read this checkpoint after compaction. Never restart completed tasks or treat a demo screenshot as proof of a production write flow.

If a task is too large, split it along a workflow boundary; do not reduce requirements. When a test exposes a behavioral difference, determine whether it is an intended presentation change or a regression before changing expectations. Retain the original financial test as an independent oracle. No parallel agents by default.

## Ready-to-use execution prompt

> Implement `docs/TAZRIM-FRONTEND-REPLACEMENT-PLAN.md` in the canonical Budgit repository using GPT-6.1 Sol with medium reasoning. Read project instructions and establish the source/feature baseline first. Follow the numbered tasks sequentially, preserving unrelated work and all existing Budgit data, logic, privacy and save behavior. Reuse the actual pinned Tazrim React components; retain Budgit branding. Keep a durable checkpoint and finish each task's checks before advancing. Continue autonomously within the authorized scope; do not reduce this to another CSS theme or declare incomplete legacy bridges finished. Use synthetic data for tests and screenshots. Publish only after the documented acceptance and existing backup/preflight/rollback requirements pass, using the standing Budgit destination authorization and leaving Sites unchanged. Report blockers accurately; do not bypass browser permissions or purchase resources.
