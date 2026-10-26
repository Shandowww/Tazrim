import {parseDate,parseMoney} from './parser.mjs';
const clean=value=>String(value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
const key=value=>clean(value).replace(/\s/g,'');
// Cal's cycle total is not the sum of original installment purchases.
// Return a proposal only after reconciling every billed amount to its printed total.
export function parseCalBilling(inspections){
 const candidates=inspections.filter(s=>s.rows.some(r=>r.cells.some(c=>/^עסקאות לחיוב ב-/.test(clean(c)))));
 if(!candidates.length)return null;
 if(candidates.length!==1||inspections.length!==1)throw Error('הקובץ מכיל כמה גיליונות או חיובים. יש להעלות דוח של כרטיס ומועד חיוב אחד.');
 const rows=candidates[0].rows;
 const totals=rows.flatMap((r,i)=>r.cells.map(c=>({text:clean(c),i,row:r}))).filter(v=>/^עסקאות לחיוב ב-/.test(v.text));
 if(totals.length!==1)throw Error('בדוח כאל חייב להיות מועד חיוב אחד.');
 const total=totals[0],match=/^עסקאות לחיוב ב-\s*(\d{1,2}\/\d{1,2}\/\d{4}):\s*(.+)\s+₪$/.exec(total.text);
 if(!match||/(?:USD|EUR|\$|€)/i.test(match[2])||total.row.cellIssues?.length)throw Error('לא זוהה סיכום חיוב שקלי ברור בדוח כאל.');
 const dueDate=parseDate(match[1]),amountCents=parseMoney(match[2]);
 if(amountCents===null||amountCents<0)throw Error('סך החיוב בדוח כאל אינו תקין.');
 const headers=rows.map((r,i)=>({r,i,keys:r.cells.map(key)})).filter(h=>h.keys.includes('תאריךעסקה')&&h.keys.includes('שםביתעסק')&&h.keys.includes('סכוםחיוב'));
 if(headers.length!==1||headers[0].i<=total.i)throw Error('לא זוהתה טבלת חיובים יחידה בדוח כאל.');
 const header=headers[0],index=name=>{const all=header.keys.map((k,i)=>k===name?i:-1).filter(i=>i>=0);if(all.length!==1)throw Error('עמודות דוח כאל אינן חד משמעיות.');return all[0];},date=index('תאריךעסקה'),merchant=index('שםביתעסק'),charge=index('סכוםחיוב');
 const entries=[];let sum=0,count=0,footer=false;
 for(const row of rows.slice(header.i+1)){
  const values=row.cells.map(clean);if(!values.some(Boolean))continue;
  if(values.filter(Boolean).length===1&&values.some(v=>v.startsWith('את המידע המלא על כל עסקה אפשר למצוא באתר ובאפליקציית כאל.'))){footer=true;continue;}
  if(footer||row.cellIssues?.length||!values[merchant])throw Error('יש שורה לא ברורה בדוח כאל. יש לבדוק את הדוח לפני קליטה.');
  parseDate(values[date]);
  if(/(?:USD|EUR|\$|€)/i.test(values[charge]+' '+(row.sourceCells?.[charge]??'')))throw Error('סכום החיוב חייב להיות בשקלים בדוח כאל.');
  const amount=parseMoney(values[charge],row.numericColumns?.includes(charge)?'dot':'auto');
  if(amount===null)throw Error('חסר סכום חיוב בשורה בדוח כאל.');
  const originalColumn=header.keys.indexOf('סכוםעסקה'),notesColumn=header.keys.indexOf('הערות');
  const original=originalColumn<0?amount:parseMoney(values[originalColumn],row.numericColumns?.includes(originalColumn)?'dot':'auto');
  if(original===null)throw Error('חסר סכום העסקה המקורי בדוח כאל.');
  if(values[merchant].length>100)throw Error('שם בית העסק ארוך מדי לקליטה.');
  entries.push({date:parseDate(values[date]),merchant:values[merchant],amountCents:amount,originalCents:original,notes:notesColumn<0?'':values[notesColumn]});
  sum+=amount;count++;
 }
 if(!count||sum!==amountCents)throw Error('סכומי השורות אינם תואמים לסך החיוב בדוח כאל. אין לקלוט דוח חלקי.');
 return {issuer:'cal',dueDate,amount:amountCents/100,count,entries};
}
