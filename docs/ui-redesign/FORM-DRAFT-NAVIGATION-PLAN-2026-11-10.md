# Persistent form drafts and uninterrupted navigation

Execution brief for GPT-6.1 Sol. Prepared 2026-11-10. This document is a plan; it does not claim implementation or release.

## Intended outcome

When Tal partially fills a form, moving elsewhere in the app should preserve the unfinished input without asking to save or discard it. Returning to the same form restores the draft. Explicit Save remains the only action that commits financial changes. A device draft must never affect balances, reports, calculations or other users' saved data.

Implement this across ordinary editable workflows in the current React interface. Audit every draft-guard registration and record its disposition; do not finish after adding support to one example form. Keep justified exceptions for secrets, destructive confirmations, unsupported recovery and unresolved server mutations. Preserve the original interface's existing draft behavior and shared financial commands.

## Source and prerequisites

- Work in `/Users/talshandor/Documents/personal-projects/monthly-flow/work/budgit-household-ui`, branch `codex/budgit-household-ui`. Verify HEAD and working-tree state before editing. Preserve unrelated changes, including any untracked Python cache. Do not deploy the outer checkout.
- Read this checkout's `AGENTS.md`, `README.md`, `PROJECT-HANDOFF.md`, `APP-GUIDELINES.md` and `docs/tazrim-migration/completion-plan.md`. Follow the newest live evidence referenced by local instructions; older checkpoint numbers in the conversation are not pins. At planning time, local instructions identify application `123b773` as live.
- Reuse existing commands, report orchestration, encryption, permissions and revision checks. No parallel financial engine, backend autosave, paid service or new hosting.
- Execute directly; this brief does not request additional agents. Read applicable current instructions before release or Git synchronization.

## Verified starting points

| Code | Current behavior and implication |
| --- | --- |
| `frontend/src/app/draft-guard.tsx` | Blocks route changes and browser exit for any dirty or busy entry; offers save/discard/stay. It has no distinction between protected local input and unprotected input. |
| `frontend/src/app/draft-registry.ts` | Holds lifecycle callbacks in memory. Removing a form unregisters it; this registry does not store the form's values. |
| `src/device-drafts.js` | IndexedDB store, authenticated encryption, account/budget scope and transactional compare-and-replace already exist. |
| `frontend/src/app/device-draft-writer.ts` | Writes to a single `draft:` key per account/budget and refuses an existing copy. It accepts full-plan payloads, so it is unsuitable as-is for multiple independent partial forms. |
| `frontend/src/app/use-plan-device-draft.ts` | Debounces complete, valid plan drafts for profile, forecast settings and comparison goals. Incomplete fields cannot be stored through this hook. |
| `frontend/src/app/device-draft-api.ts` and `device-draft-page.tsx` | Existing recovery/export flow validates scope, key and revision. Preserve its existing records and behavior. |
| `frontend/src/app/plan-save.ts` | Existing explicit save path is the authority for financial validation, conflicts and uncertain-result recovery. |

Start with `rg -n 'useFinancialDraft|usePlanDeviceDraft' frontend/src/app` and inspect additional guard calls, modal editors, original-interface bridges and save completion paths. Relevant existing tests include `test/tazrim-draft-registry.test.mjs`, `test/tazrim-device-draft.test.mjs` and `test/tazrim-device-draft-settings-summary.test.mjs`.

## 1. Inventory and recovery contract

Create a compact coverage table in the implementation evidence. For each editor record: route/form identity, raw editable state, baseline/revision, existing save command, restoration dependencies, sensitive fields, and whether it supports automatic drafts or needs a specific guard exception.

Cover monthly reports, account/card metadata, loans, planned items/cheques, savings/goals, categories/detail annotations, scenarios and ordinary settings. Include report-review choices, source/group progress and auxiliary dialogs in the audit. Reuse existing report serializers and progress machinery; do not invent another import workflow. Never upload report progress merely because navigation occurred.

Define a versioned form-draft envelope with authenticated user ID, budget ID, form kind, record identity (or stable new-form identity), relevant period/account/source/group identifiers, base server revision, schema version, update time and raw editable values. Scope by semantic identity, not the complete URL: incidental filters must not create duplicate drafts; real period/account changes must never reuse another scope's input. Preserve existing route context, scroll restoration and successful-save return behavior.

Store partial and invalid input exactly as entered, including blank and incomplete amount strings. Shape validation of a stored draft must not require a financially valid completed form. Never serialize closures, DOM nodes, derived financial totals, credentials, vault passwords, recovery secrets or session tokens. Do not persist destructive approvals or commit consent as reusable authorization; require fresh confirmation when restoring such workflows.

## 2. Extend existing device storage safely

Add a separate versioned form-draft namespace in the existing IndexedDB records store. Keep legacy `draft:` records readable and untouched. Reuse encryption and vault lifecycle primitives; generalize narrowly where required instead of changing legacy key meanings or duplicating storage logic. Bind each new envelope's full scope to authenticated encryption and validate it after decryption.

Support load, serialized write/flush, and conditional delete. Use transactional compare-and-replace with a witness so another tab's draft cannot be silently overwritten or deleted. Allow multiple forms and periods to coexist. Persist only necessary editable fields and comparison baselines, not a complete budget snapshot for every editor.

Debounce ordinary typing, but expose a flush that waits for the latest generation of input to commit to IndexedDB. A previous successful write does not protect newer keystrokes. Ignore late loads/writes after scope changes, logout, vault lock or unmount; never let an older restore overwrite input the user has already typed. Surface unavailable storage, quota failure, decryption failure and conflicts without losing the current in-memory form or prior stored copy.

Preserve current encrypted/non-vault key behavior without claiming protection against someone who already controls the browser profile. Clear decrypted state on lock/logout and isolate retained encrypted drafts by actor. Do not silently expire recoverable work or automatically evict another form to free storage. Provide scoped discard and, where useful, explicit export through a versioned form-draft format; do not label raw partial forms as valid budget exports.

## 3. Separate local protection from financial saving

Extend the registry and shared hook with explicit local-draft state/capabilities: edited, persistence pending, latest input persisted, persistence failed, flush, and restoration/conflict status. Keep server mutation state and uncertain outcomes separate. Preserve existing Save enablement and dirty semantics; a locally persisted draft is still financially unsaved.

For ordinary internal navigation:

1. Capture the requested destination once and collect the affected dirty forms.
2. If a financial operation is running or its outcome remains unknown, retain the existing protection/reconciliation path. A cached form cannot resolve a server mutation.
3. Flush the latest recoverable input and wait for committed local storage. Navigate automatically on success without the save/discard dialog and without invoking a financial save.
4. On unsupported recovery or persistence failure, stay on the current page and show an actionable explanation with the applicable retry, explicit save, explicit discard and stay actions. Do not discard first and attempt to store afterward.

Handle multiple mounted editors, rapid navigation attempts, browser Back/Forward, sidebar/mobile navigation and route query changes without duplicate navigation or writes. A component unmount must not erase its stored draft. Preserve the provider's existing protection for non-route actions; define navigation, refresh, logout, vault lock and interface-switch behavior explicitly instead of making every `guard.run` call bypass protection.

For refresh/full-page exit, asynchronous storage cannot be guaranteed from `beforeunload`. Persist during editing; suppress the warning only when all relevant latest input is already durable and restorable, with no unresolved mutation. Otherwise retain the warning. Flush before app-controlled refresh and preserve existing failed-refresh behavior. Browser/PWA process termination can still lose the newest uncommitted keystrokes; do not claim guaranteed recovery from every OS kill or new offline support.

## 4. Restore and save without stale overwrites

- On opening an editor, load saved data and its scoped draft. Automatically restore compatible drafts and display a small restoration status. Avoid briefly enabling an empty form before its draft is checked.
- If server revision, record/source identity, permissions, schema or vault key no longer matches, keep the local draft separately and explain the conflict. Do not replace the current budget with an old snapshot or silently rebase financial choices. Offer review/export/discard as appropriate; explicit reconciliation must use current validation.
- Support legitimate new-form drafts with stable identities; successful creation must not reopen the same draft as another new record.
- Use the original explicit save command. Following confirmed success, conditionally remove only the exact draft generation that was saved. Protect edits made during the save and another tab's newer copy. Prevent a pending local writer from recreating a draft after save or discard.
- Failed or uncertain saves preserve the draft and existing same-operation retry/reconciliation protections. Draft restoration must never replay a financial request, repeat an import or reuse an approval automatically.
- If the server save succeeds but local cleanup fails, report the actual successful save separately from cleanup trouble. Ensure a retained stale draft cannot create a duplicate or silently replace the saved result.
- Preserve explicit save-and-continue and successful-save return behavior. Automatically leaving an unfinished form must not emit a financial-save success receipt.

## 5. Connect editors and provide restrained UI

Implement one shared hook/adapter, prove it with a representative partial form, then connect every ordinary editor in the inventory. Keep the existing form models and validators. Avoid double writers when replacing the three full-plan autosave integrations: retain access to old recovery copies, and prevent new per-form drafts from silently competing with legacy whole-plan drafts.

Use Hebrew, RTL and existing accessible components. Suggested statuses:

- `שומר טיוטה במכשיר…`
- `טיוטה שמורה במכשיר · טרם נשמרה בתקציב`
- `הטיוטה שוחזרה מהמכשיר`
- `לא ניתן לשמור טיוטה במכשיר. יש לשמור או לנסות שוב לפני יציאה.`

Make discard available deliberately, with the meaning of cancel/close explicit. Let users find retained drafts through the existing draft/settings surface and return to the correct editor; keep legacy recovery separate and recognizable. Use polite status announcements without announcing every keystroke. Preserve iPhone touch targets, keyboard focus, themes and reduced motion. No routine modal or repeated toast for successful local persistence.

## 6. Verification and acceptance

Add meaningful behavior tests around the new storage and navigation lifecycle; static source assertions alone are insufficient. Run focused tests while implementing, then the repository's required build/typecheck, regression and core checks (`node build.mjs`, `node verify.mjs`, and the current documented test runner). Use the current checkout's scripts and instructions for exact commands.

Required scenarios:

- Enter partial amount/text, navigate immediately before debounce finishes, return: exact input restored, no warning, zero financial writes.
- Navigate between two different forms and two periods/accounts: independent drafts survive. Back/Forward and repeated taps select one intended destination.
- Reload/reopen after confirmed local persistence: draft restored; no automatic financial mutation. Unsaved drafts do not change overview totals.
- Full disk/storage denial/transaction failure: navigation remains guarded and the last usable data/draft survives. Retry can recover.
- Competing tabs, stale revisions, deleted records, viewer downgrade, account/budget switch, lock/unlock and changed keys: no cross-scope disclosure or silent overwrite.
- Save success, save failure, lost response, edits during save, cleanup failure and discard during queued writes: correct retention/cleanup, no duplicate create/import, no resurrection.
- Restore racing with typing, late writes after unmount and incompatible payload versions: no data loss or unsafe restoration.
- Existing legacy local drafts and original-interface workflows continue working; existing report serializers, approvals and financial invariants remain intact.
- Report choices involving files or stored sources preserve their existing identity checks. If a file cannot be recovered, clearly request reselection without claiming the workflow is fully restorable.
- Keyboard and synthetic phone-width interactions, light/dark, focus and scroll behavior remain usable. Use the available permitted browser/testing workflow and synthetic records. Report actual coverage; physical-iPhone acceptance requires a physical-device check.

Acceptance: all ordinary recoverable forms in the inventory retain exact unfinished input across navigation without a confirmation dialog. Every remaining warning has a specific justified exception. No automatic financial saves, silent concurrent overwrites, loss of existing recovery copies or regression in confirmed-save behavior.

## 7. Delivery and release

Update the coverage table and evidence with implemented behavior, verified checks and remaining justified exceptions. Do not present a partial migration as complete. Back up completed changes using the existing personal SSH Git destinations and current tracked-source fork export process; preserve unrelated work and independent repository histories.

When executing this plan, follow the project's existing publication authorization and mandatory release procedure: reconcile current live source, fresh verified SQLite backup, isolated financial/access preflight, rollback preparation, and runtime hash/health/auth/authoritative-data/adjacent-service verification. Keep Sites unchanged and use existing resources. Do not treat this planning-only turn as an instruction to deploy now. If an actual release gate fails during execution, report the failure and preserve the working release.

Final implementation report should state the user-visible change, coverage/exceptions, tests actually run, source checkpoint and whether publication was verified. Distinguish local draft persistence from offline support and from confirmed financial saving.
