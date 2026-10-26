# אישור חודש ללא עסקאות

בהוצאות → דוחות האשראי לשנה, ליד חודש חסר שהסתיים, לחצו **ללא עסקאות**, בדקו את הכרטיס וחודש החיוב ואשרו. לאחר מכן לחצו **שמור שינויים**. יש לאשר רק כשלא היו עסקאות, זיכויים או חיובים, כולל תשלומים מעסקאות קודמות. בכרטיס ללא חשבון משלם יש להשלים תחילה את השיוך בהגדרות.

האישור מתייחס לכרטיס ולחודש שנבחרו בלבד. הוא רושם חיוב אפס ומסיר את החודש מרשימת הדוחות החסרים ומהתזכורת לדוח צפוי. הוא מסומן כאישור ידני, אינו נספר כקובץ שנקלט ואינו מסמן את התקציב החודשי כולו כדיווח בפועל. חודשים פתוחים ועתידיים אינם זמינים לאישור.

לביטול: פתחו **מצב הדוחות לפי חודש** בכרטיס, לחצו **ביטול האישור** ושמרו. אם היה דיווח ידני של אפס לפני האישור, הוא משוחזר. קובץ מקור שנקלט בהמשך מחליף את האישור. תנועות או סכומים בפועל שסותרים אותו מחזירים את הדרישה לדוח, בלי להסתיר את המידע החדש.

Implementation: the existing validated, scoped budget contains a zero billing record with `source: 'no-transactions'`. No external API, new service or database migration is required. Existing revision checks, encryption and save-failure recovery apply. Annual coverage counts files and zero confirmations separately; monthly source coverage and expected-report reminders recognize the explicit declaration.
