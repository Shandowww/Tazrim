import {parseDate,parseMoney} from './parser.mjs';
const clean=value=>String(value??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
const key=value=>clean(value).replace(/[\s:״”"׳']/g,'');
const footerPrefix='את המידע המלא על כל עסקה אפשר למצוא באתר ובאפליקציית כאל.';
const labels=['תאריךעסקה','שםביתעסק','סכוםבשח','מועדחיוב','סוגעסקה','הערות'];
// This is an activity export, not a final single-cycle bill. Never infer a
// monthly total from its cross-cycle sheet total or from an installment price.
export function parseCalActivity(inspections){
 const candidates=inspections.filter(s=>s.rows.some(r=>r.cells.some(c=>clean(c).startsWith(footerPrefix)))&&s.rows.some(r=>labels.every(label=>r.cells.some(c=>key(c)===label))));
 if(!candidates.length)return null;
 if(candidates.length!==1||inspections.length!==1)throw Error('בחרו דוח פעילות כאל של כרטיס אחד וגיליון אחד.');
 const rows=candidates[0].rows,headers=rows.map((r,i)=>({r,i})).filter(({r})=>labels.every(label=>r.cells.some(c=>key(c)===label)));
 if(headers.length!==1||headers[0].r.cellIssues?.length)throw Error('טבלת הפעילות של כאל אינה חד־משמעית.');
 const header=headers[0],column=label=>{const indices=header.r.cells.flatMap((c,i)=>key(c)===label?[i]:[]);if(indices.length!==1)throw Error('עמודות הפעילות של כאל אינן חד־משמעיות.');return indices[0];};
 const [date,merchant,amount,due,type,notes]=labels.map(column),totals=rows.map((r,i)=>({r,i})).filter(({r})=>r.cells.some(c=>key(c)==='סהכעסקאותבגיליוןזה'));
 if(totals.length!==1||totals[0].i<=header.i||totals[0].r.cellIssues?.length||!totals[0].r.cells.some(c=>key(c)==='הסכוםאינוכוללעסקאותשחויבובמטחועסקאותבתהליךקליטה'))throw Error('לא זוהה סיכום פעילות נתמך בדוח כאל.');
 const summary=totals[0],sheetTotalCents=parseMoney(summary.r.cells[amount],summary.r.numericColumns?.includes(amount)?'dot':'auto');
 if(sheetTotalCents===null||sheetTotalCents<0)throw Error('סיכום הפעילות של כאל אינו תקין.');
 const after=rows.slice(summary.i+1);if(after.length!==1||after[0].cellIssues?.length||after[0].cells.filter(c=>clean(c)).length!==1||!after[0].cells.some(c=>clean(c).startsWith(footerPrefix)))throw Error('נמצאו שורות נוספות או חסרות בסיום דוח כאל.');
 if(rows.slice(0,header.i).some(r=>r.cellIssues?.length))throw Error('כותרת דוח כאל מכילה תא שאינו ערך מקורי.');
 const title=rows.slice(0,header.i).flatMap(r=>r.cells).map(clean).join(' '),ids=[...title.matchAll(/לכרטיס\s+(?:מאסטרקארד|ויזה|דיינרס)\s+(\d{4})(?!\d)/g)].map(m=>m[1]);
 if(new Set(ids).size>1)throw Error('דוח הפעילות מכיל יותר מכרטיס אחד.');
 const entries=[];
 for(const row of rows.slice(header.i+1,summary.i)){
  const values=row.cells.map(clean),amountCents=parseMoney(values[amount],row.numericColumns?.includes(amount)?'dot':'auto');
  if(row.cellIssues?.length||amountCents===null||!values[merchant]||values[merchant].length>100||values[notes].length>2000||/(?:USD|EUR|GBP|\$|€|£)/i.test(values[amount]+' '+(row.sourceCells?.[amount]??'')))throw Error('שורת פעילות כאל אינה קריאה או שסכומה אינו בשקלים.');
  const dueDate=values[due]?parseDate(values[due]):'',pending=/עסקה בקליטה|בתהליך קליטה/.test(values[notes]),installment=/תשלומים/.test(values[type]+' '+values[notes]);
  entries.push({date:parseDate(values[date]),merchant:values[merchant],amountCents,originalCents:amountCents,notes:values[notes],dueDate,pending,installment,line:row.line});
 }
 if(!entries.length||entries.length>5000||entries.filter(r=>!r.pending).reduce((sum,r)=>sum+r.amountCents,0)!==sheetTotalCents)throw Error('שורות הפעילות אינן תואמות לסיכום כאל. אין לקלוט קובץ חלקי.');
 return{kind:'card',provider:'cal',identity:ids.length?'cal:'+ids[0]:'',activity:{version:1,sheetTotalCents,entries},report:null};
}
export function calActivityReport(activity,dueDate,confirmedTotal,confirmed){
 if(activity?.version!==1||!Array.isArray(activity.entries))throw Error('דוח הפעילות אינו תקין.');
 if(!dueDate)throw Error('בחרו מועד חיוב מתוך הדוח.');parseDate(dueDate);
 const cycle=activity.entries.filter(r=>r.dueDate===dueDate&&!r.pending);
 if(cycle.some(r=>r.installment))throw Error('המחזור כולל מחיר עסקה בתשלומים ללא סכום תשלום חודשי. הורידו את דוח החיוב החודשי מכאל.');
 const entries=cycle.filter(r=>!r.installment).map(({date,merchant,amountCents,originalCents,notes})=>({date,merchant,amountCents,originalCents,notes})),total=entries.reduce((sum,r)=>sum+r.amountCents,0),entered=parseMoney(confirmedTotal);
 if(!entries.length||total<0)throw Error('לא נמצאו שורות חיוב שקליות נתמכות למועד שנבחר.');
 if(entered===null)throw Error('הזינו את סכום החיוב הסופי שמופיע בכאל או בבנק, עבור המועד שנבחר.');
 if(entered!==total)throw Error('השורות למועד שנבחר אינן תואמות לסכום החיוב הסופי. הורידו דוח חיוב חודשי מלא מכאל.');
 if(confirmed!==true)throw Error('אשרו שהסכום נבדק מול החיוב הסופי ושהשורות מחוץ למועד שנבחר לא ייקלטו.');
 return{issuer:'cal',dueDate,amount:total/100,count:entries.length,entries};
}
