export function driveBackupStatusText(data){return (data.connected?'Google Drive מחובר. ':'טרם חובר Google Drive. ')+(data.ready?'מפתח ההצפנה הוגדר. ':'מפתח ההצפנה טרם הוגדר. ')+(data.lastSuccess?'גיבוי אחרון שהועלה ושלמותו נבדקה בהורדה חוזרת: '+new Date(data.lastSuccess).toLocaleString('he-IL')+'. ':'עדיין אין גיבוי חיצוני מוצלח. ')+(data.enabled?(data.scheduleMode==='changes-nightly'?'גיבוי ב־23:59 לפי שעון ישראל, רק לאחר שינויים שמורים. ':'גיבוי יומי פעיל. '):'גיבוי אוטומטי כבוי. ')+(data.pendingChanges?'יש נתונים שטרם גובו. ':'')+(data.error||'');}
export function driveBackupNextStep(data){return !data.ready?'הצעד הבא: השלמת הגדרת מפתח השחזור לפני יצירת גיבוי.':!data.connected?'הצעד הבא: חברו Google Drive דרך אפשרויות הגיבוי המלאות, ואז צרו גיבוי ואמתו את שלמותו.':!data.lastSuccess?'הצעד הבא: לחצו על „גיבוי עכשיו” והמתינו לאישור העלאה ובדיקת שלמות. חיבור Google לבדו אינו יוצר גיבוי.':'הצעד הבא: הורידו גיבוי מוצפן ובצעו תרגיל שחזור עם המפתח הפרטי במחשב נפרד. האפליקציה אינה מאמתת שבוצע תרגיל שחזור.';}
export function driveBackupActionBody(action,mode='changes-nightly'){
 if(action==='drive-backup-status')return null;
 if(action==='drive-backup-run')return{action:'run'};
 if(action==='drive-backup-disconnect')return{action:'disconnect'};
 if(['drive-backup-enable','drive-backup-disable'].includes(action))return{action:'schedule',enabled:action==='drive-backup-enable',mode};
 throw Error('פעולת הגיבוי אינה זמינה.');
}
