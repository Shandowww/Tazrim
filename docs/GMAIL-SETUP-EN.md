# Connect Gmail to Budgit — English instructions

Updated 19 October 2026. Gmail and Google Cloud button names below are in English. Budgit is still in Hebrew, so its actual button names appear alongside English explanations.

Signing in to Budgit with Google and backing up to Drive do not connect your mailbox. Gmail needs its own connection. Use the same Google account you use to sign in to Budgit; the current connector rejects a different account.

## Your Cal card linked to Hapoalim: emails containing a login link

You confirmed that these messages have a link to the report, rather than the report attached. Cal's official service describes email/SMS notifications linking to statements in its website/app. Gmail access alone therefore cannot retrieve this statement. [Cal: digital statements](https://www.cal-online.co.il/service-and-support/cal-mail/).

For this card, the current working path is:

1. Open Cal's app, or its [official self-service page](https://www.cal-online.co.il/self-service/), and sign in yourself.
2. Under **עסקאות וחיובים**, look for **דפי פירוט דיגיטליים — צפייה והורדה**. Select the correct card and billing period. Cal's interface remains Hebrew even though your Gmail is English.
3. Download the actual statement/export to your computer or iPhone. Use a format supported by Budgit; if the downloaded layout is not recognized, keep the file and report the error rather than changing its amounts.
4. Open Budgit → **מרכז הדוחות**, upload the downloaded file, review its card/month/totals and finish the import. Keep the original file.

The planned addition is a pending “Download report” task with buttons for Cal and the original email, followed by “Upload report”. Opening the portal, receiving the email or marking a notice read will not count as importing a statement. This task is **planned, not implemented yet**. The current Gmail connector imports attachments and can show some statement-related notices; it does not sign in to Cal or follow links to fetch files. The daily folder Shortcut is also still being built, so manual upload is the available path now.

You can still label these emails `Budgit Reports`, but do not require **Has attachment** for this filter. Gmail can remain useful for bank notices and reports that really are attached; it is not necessary for the manual Cal download/upload path. No Cal password, OTP or persistent bank session will be stored in Budgit or the Shortcut.

Gmail is optional and kept in secondary Settings. The main workflow is downloading statements and uploading them to **מרכז הדוחות** (Report Center). Apple Pay remains available in Connections and import. You can continue saved unfinished reports directly inside Report Center.

## 1. Choose which mail Budgit should process

You can use exact sender addresses directly in Budgit. Creating a Gmail label is optional, but makes it easier to review the selection yourself.

For an optional label, use Gmail on your computer:

1. Open a genuine bank/card statement email and check its full sender address, rather than just the display name.
2. Open **More** (the three-dot menu) → **Filter messages like these**. Check **From**, and narrow the criteria if that sender also sends unrelated mail. First use **Search** to inspect the matches.
3. Return to the search options and click **Create filter**.
4. Select **Apply the label** → **Choose label** → **New label…**, and call it `Budgit Reports`. If you already created that label, select it instead.
5. To include existing matching messages, select **Also apply filter to … matching conversations**. Check the matches before applying it.
6. Click **Create filter**. Repeat for other verified statement senders, using the same label.

Apply the label only: archiving, forwarding and deletion are not needed. To adjust the rule later, open **Settings** → **See all settings** → **Filters and Blocked Addresses** → **Edit**.

If you also want bank notices about fees or benefits, include the relevant messages in your selection. A filter requiring attachments can exclude those notices. Gmail labels group messages; a label does not upload anything to Budgit by itself. [Google: filters](https://support.google.com/mail/answer/6579?hl=en), [Google: labels](https://support.google.com/mail/answer/118708?hl=en).

## 2. Connect inside Budgit

1. Save open edits, refresh [Budgit](https://budgit.duckdns.org), and select the destination budget.
2. Open the menu → **חיבורים וייבוא** (Connections and import) → expand **חיבורים נוספים** (Additional connections) → **הגדרות Gmail** (Gmail settings). This opens **Gmail — דוחות ועדכונים מהבנק**.
3. Click **חיבור נפרד ל־Gmail** (Connect Gmail separately), then review Budgit's explanation and continue if you agree.
4. On Google's English consent screen, select the same account you use for Budgit. Review the requested access and choose **Continue** / **Allow** if you agree. The wording can vary.
5. Back in Budgit, click **בדיקת החיבור** (Check connection). Check the connected email and that your Gmail labels load.

The `gmail.readonly` permission allows broad mailbox reading. Budgit's filters limit what the app processes; they do not limit Google's permission to one label. It does not request permission to send, modify or delete mail. Attachments imported into a shared budget are available to that budget's authorized participants; bank notice text stays private to your signed-in account. For an encrypted budget, the app also requires the owner's separate consent to storing report originals that the server can read. [Google: Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 3. Preview, then enable import

1. Under **כתובות שולחים, מופרדות בפסיק**, enter the exact sender addresses, separated by commas; and/or select `Budgit Reports` under **תוויות Gmail (לבחירה)**. At least one sender or label is required. When you set both, a message must satisfy both. Multiple selected labels must all match; start with one label.
2. Set **החל מתאריך** (Starting date) to a short range containing a known report. Select the desired **PDF / CSV / XLS / XLSX** file types. The date starts at midnight in Israel.
3. Click **בדיקת הודעות תואמות** (Preview matching messages). This shows up to ten message subjects/senders without importing attachments. Review the sample; it is not the entire result set.
4. If correct, tick **בדקתי את הדוגמאות ואני מאשר משיכה של ההודעות והקבצים התואמים לתקציב הנבחר**.
5. Click **שמירת הסינון והפעלת המשיכה** (Save filters and enable fetching).
6. Click **בדיקה עכשיו** (Check now). A large result set may need more pages; wait for a completed scan. Normal checks run approximately every ten minutes; failures back off.
7. Open **מרכז הדוחות** (Report center), inspect one report and finish review. Receiving an attachment does not post it to the budget automatically. Supported attachments are limited to 5 MiB each.

Changing the filter requires another preview and confirmation. **השהיית המשיכה** pauses fetching; **ניתוק Gmail** disconnects it in Budgit. Reports already stored remain. Bank messages appear under **עדכונים מהבנק**; review the linked original before treating a notice as an actual charge.

## 4. Google Cloud setup, only if needed

If Gmail API is disabled or Google blocks authorization, open [Google Cloud Console](https://console.cloud.google.com/) and select the **existing Budgit project** in the top project picker.

1. **APIs & Services** → **Library** → search for **Gmail API** → **Enable**. If already enabled, leave it enabled.
2. **Google Auth platform** → **Data Access** → **Add or remove scopes**. Find/add `https://www.googleapis.com/auth/gmail.readonly`, then **Update** and **Save** as offered.
3. If **Audience** shows **Testing**, open **Test users** → **Add users**, add the Google account used for Budgit, then **Save**. An account already listed need not be added again.
4. Return to Budgit and start **חיבור נפרד ל־Gmail** again.

Keep the existing OAuth client and callback `https://budgit.duckdns.org/auth/google/callback`. No new Client ID, Client Secret, service account or Desktop app client is needed. Keep the existing Drive scopes. Making the project public is not required for this setup. Verification depends on the audience and usage; adding a scope does not complete verification. [Google: enable Gmail API](https://developers.google.com/workspace/gmail/api/quickstart/python#enable_the_api), [Google: OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent), [Google: app audience](https://support.google.com/cloud/answer/15549945?hl=en).

## Troubleshooting

| What you see | What to check |
| --- | --- |
| `Error 403: access_denied` and “app is being tested” | Correct project → **Google Auth platform** → **Audience** → **Test users**; add the same Google account selected during connection. |
| Gmail API disabled / `accessNotConfigured` | Enable **Gmail API** in the project used by Budgit's current OAuth client. |
| Connection fails after choosing another Gmail account | Reconnect with the same email used to sign in to Budgit. |
| Label absent from Budgit | Click **בדיקת החיבור** after creating the label. Reconnect if authorization is required. |
| Empty preview | Check exact sender, starting date and label. Remove unnecessary criteria; sender and label combine, and multiple selected labels must all match. Preview again. |
| Scan says more pages remain | Let subsequent checks continue, or use **בדיקה עכשיו** again. Check the completed coverage range afterward. |
| Report received but budget unchanged | Open **מרכז הדוחות** and finish review/import. Receiving and committing are separate steps. |
| Previously working connection needs authorization again | Reconnect in Budgit. Google can expire/revoke authorization, including test-mode authorization. Review filters before enabling again. |

Report the step and error text if you need help. Do not send passwords, access tokens or private email content in chat.
