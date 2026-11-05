# iPhone Safari acceptance — household redesign

## Acceptance received — 2026-11-05

Tal reported checks 1–5 working, reviewed the revised preview, and accepted completion after confirming that identical personal/shared goals were duplicated fictional seed data. Accepted application source: `d67cf22`. iPhone model, iOS version and physical Reduce Motion status were not provided. The checklist below remains as the test procedure; these missing details and untested real provider integrations are recorded limitations, not additional requests for the accepted redesign.

Use the temporary HTTPS preview link supplied in the chat. It uses fictional records and requires no login. Do not use the live Budgit address for this check, and do not enter real financial information. Keep the Mac awake while testing; the temporary preview expires within 24 hours.

Record iPhone model, iOS version, Safari version if known, and whether Reduce Motion is enabled. For each item, mark Pass or Fail and attach a screenshot or short recording of any failure.

| Check | Steps | Expected |
| --- | --- | --- |
| Safe areas and layout | Open Home, Accounts, Goals, More in portrait. Scroll to each screen's bottom, then rotate to landscape and back. | No content under the notch or home indicator, no clipped action, no sideways page scroll; text and amounts remain readable. |
| Card touch | On Accounts, swipe one card sideways, then swipe vertically on the card. | Sideways selects the adjacent card and updates its amount/details; vertical movement scrolls the page without selecting another card. |
| Refresh | At the very top of Accounts, pull down starting within the upper part of the screen. Return to the top, then pull from the middle of the screen and scroll normally. | Only the top-area pull gives refresh feedback; a lower-screen pull and normal scrolling do not trigger refresh. |
| Personal and shared | On Accounts, switch between Tal's personal and the shared test space. | The personal space shows “חשבון אישי של טל · בדיקה”; the shared space shows “חשבון משותף של טל ולינוי · בדיקה” with different balances. |
| Hebrew chart | On Home, inspect the six-month chart. | The first month, May in this preview, is on the right. |
| Bottom menu | From More open Cheques → Add and then another nested page. | The main bottom menu remains visible and does not cover the form or the home indicator. Navigation still asks before leaving unsaved edits. |
| Appearance | In Settings choose System. Change iPhone appearance Light → Dark → Light while Safari stays open. Then choose manual Dark and Light. | System follows the device immediately; manual choices apply immediately and remain after reload. |
| Keyboard and focus | Open More → Cheques → Add or another amount form. Tap an amount field, type 1000, edit the number, and move to the next field. If an external keyboard is available, use Tab and Shift Tab. | The field shows 1,000 with the cursor in the expected place; the active field and action remain reachable when the keyboard opens; focus is visible. |
| Draft protection | More → Cheques → Add. Enter a fictional description. Tap the app Back control and choose Stay. Then try browser Back and choose Stay. Finally leave without saving. | Both attempts ask about unsaved work; Stay preserves the text and route; discard leaves without creating a record. |
| Reduced motion | If comfortable, enable iPhone Settings → Accessibility → Motion → Reduce Motion, then reopen Accounts and change cards. | Card selection still works without distracting animation. Restore the device setting afterward if desired. |

Send the results as `item: Pass/Fail — notes`, plus device details. Report any form that does not open or any unexpected login or real account data. A failure is useful evidence; it does not need to be retested before reporting.

The temporary preview verifies physical Safari behavior against synthetic data. Real provider integrations and production publication have separate gates. Do not mark checklist items complete until the device results are received and reviewed.
