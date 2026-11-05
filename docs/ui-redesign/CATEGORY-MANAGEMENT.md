# Category management

The More menu has an **Edit categories** submenu in Advanced and Expert modes. It opens the existing protected category editor and the spending-limit page. Basic mode retains category reports without editing controls.

The editor can add a category or child category, rename it, move it, change its color, archive or restore it, merge a leaf category, and remove a category with its descendants. Changes are scoped to the selected budget and require an explicit review and confirmation. Saved custom colors appear in the category lists and charts. Names and colors stay separate from the original report text.

Removal shows the number of stored detail records, bank movements, spending limits and child categories affected. Counts include cancelled details and saved splits, because they can become active again. If any references or limits exist, the user must select another active category outside the removed branch. The change redirects the old stable identities to that destination in one reviewed budget save. Historical source labels, amounts, statement receipts and split amounts remain intact. A limit moves only when the target has no conflicting limit; otherwise the editor links to spending limits for explicit resolution. An unused category can be removed without a destination and remains restorable from the archive.

The operation uses the existing account-bound revision save. A lost response is checked against the saved candidate before retrying; a competing edit blocks overwrite. Viewers cannot edit. For historical reliability, removal hides and redirects category identities rather than physically erasing source evidence.

Checks: `node build.mjs`, `node --test test/*.test.mjs`, `node verify.mjs`; focused category, bank and interface-mode contracts; synthetic 390px browser exercise for menu, add/color, assigned-category warning, lost-response bulk removal recovery, draft guard, viewer refusal and overflow. Physical iPhone acceptance remains separate.
