import XLSX from './vendor/xlsx-full.cjs';

// A synthetic workbook with the same separate month, charge day and totals.
export function isracardWorkbookFixture({cardHeader="\u202bאמריקן אקספרס זהב\u202c - 7234"}={}){
 const sheet=XLSX.utils.aoa_to_sheet([
  ['פירוט עסקאות',null,'אוקטובר 2026'],
  [],
  [cardHeader,null,null,null,null,null,null,'₪ 137.25'],
  ['כרטיס בדיקה',null,null,null,null,null,null,'לחיוב ב-10.10'],
  [],
  ['עסקאות למועד חיוב'],
  ['תאריך רכישה','שם בית עסק','סכום עסקה','מטבע עסקה','סכום חיוב','מטבע חיוב',"מס' שובר",'פירוט נוסף'],
  ['28/09/2026','חנות לדוגמה',300.75,'₪',100.25,'₪','8412','תשלום 1 מתוך 3'],
  ['01/10/2026','עסקה במטבע חוץ',12.5,'USD',45,'₪','8413',''],
  ['02/10/2026','זיכוי לדוגמה',-8,'₪',-8,'₪','8414',''],
  [null,'סה"כ לחיוב החודש בכרטיס בש"ח',null,null,137.25,'₪'],
  [],
  ['תנאים משפטיים\nמידע כללי לדוגמה'],
 ]);
 sheet['!merges']=[XLSX.utils.decode_range('A6:H6'),XLSX.utils.decode_range('B11:C11')];
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,sheet,'דוח בדיקה');
 return XLSX.write(workbook,{type:'buffer',bookType:'xlsx',compression:true});
}
