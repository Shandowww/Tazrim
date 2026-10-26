// Pure import inspection. No app model, persistence, network or bank-specific assumptions.
export const LIMITS={bytes:5*1024*1024,rows:30000,columns:100,cell:50000};
const clean=s=>String(s??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
const key=s=>clean(s).toLowerCase().replace(/["'׳״\s._:/()\-]/g,'');
const aliases={date:['תאריך','תאריך רישום','תאריך פעולה','תאריך תנועה','תאריך עסקה','transaction date','date','booking date'],description:['הפעולה','פרטי הפעולה','פעולה','תיאור','תיאור פעולה','תיאור תנועה','תיאור עסקה','שם בית עסק','description','details','merchant'],details:['פרטים','סוג פעולה','פרטים נוספים','additional details'],valueDate:['תאריך ערך','value date'],beneficiary:['לטובת','beneficiary'],purpose:['עבור','for'],debit:['חובה','חיובים','סכום חובה','חיוב','סכום חיוב','debit','withdrawal'],credit:['זכות','זיכויים','סכום זכות','זיכוי','סכום זיכוי','credit','deposit'],amount:['סכום','סכום פעולה','סכום תנועה','סכום עסקה','amount','transaction amount'],balance:['יתרה','יתרה בשח','יתרה לאחר פעולה','יתרה לאחר תנועה','balance','running balance'],reference:['אסמכתא','מספר אסמכתא','reference','reference number'],currency:['מטבע','currency'],direction:['סוג תנועה','חיוב/זיכוי','חובה/זכות','סוג פעולה','debit/credit','direction']};
export function decodeCSV(bytes,encoding='auto'){
 if(bytes.byteLength>LIMITS.bytes)throw Error('הקובץ גדול מדי. אפשר לבדוק קובץ עד 5MB.');
 let chosen=encoding;
 if(chosen==='auto'){
  if(bytes[0]===255&&bytes[1]===254)chosen='utf-16le';
  else if(bytes[0]===254&&bytes[1]===255)chosen='utf-16be';
  else{try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);chosen='utf-8';}catch{chosen='windows-1255';}}
 }
 const text=new TextDecoder(chosen,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 if(text.includes('\0'))throw Error('הקובץ אינו טקסט CSV קריא. נסה לשנות את הקידוד או לייצא CSV מהבנק.');
 return {text,encoding:chosen};
}
export function parseCSV(text,delimiter=','){
 if(![',',';','\t','|'].includes(delimiter))throw Error('מפריד עמודות לא תקין.');
 const rows=[];let cells=[],cell='',quoted=false,afterQuote=false,line=1,startLine=1;
 function pushCell(){if(cell.length>LIMITS.cell)throw Error('תא בקובץ ארוך מדי.');cells.push(cell);cell='';afterQuote=false;if(cells.length>LIMITS.columns)throw Error('בקובץ יש יותר מ־100 עמודות.');}
 function pushRow(){pushCell();rows.push({line:startLine,cells});cells=[];if(rows.length>LIMITS.rows)throw Error('בקובץ יש יותר מ־30,000 שורות.');}
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
  if(c===delimiter){pushCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();line++;startLine=line;continue;}
  if(afterQuote){if(c===' '||c==='\t')continue;throw Error(`מרכאות לא תקינות בשורה ${line}.`);}
  if(c==='"'){if(cell.trim())throw Error(`מרכאות לא תקינות בשורה ${line}.`);cell='';quoted=true;}else cell+=c;
  if(cell.length>LIMITS.cell)throw Error('תא בקובץ ארוך מדי.');
 }
 if(quoted)throw Error('חסרות מרכאות סגירה בקובץ.');
 if(cell||cells.length||afterQuote)pushRow();
 return rows.filter(row=>row.cells.some(c=>clean(c)!==''));
}
export function guessMapping(headers){
 const mapping=Object.fromEntries(Object.keys(aliases).map(k=>[k,-1]));
 for(const [field,names]of Object.entries(aliases)){const matches=headers.map((h,i)=>names.map(key).includes(key(h))?i:-1).filter(i=>i>=0);if(matches.length===1)mapping[field]=matches[0];}
 const explicitDirections=headers.map((h,i)=>['חיוב/זיכוי','חובה/זכות','debit/credit','direction'].map(key).includes(key(h))?i:-1).filter(i=>i>=0);
 if(explicitDirections.length===1)mapping.direction=explicitDirections[0];
 if(mapping.description<0&&mapping.details>=0){mapping.description=mapping.details;mapping.details=-1;}
 return mapping;
}
export function inspectCSV(text,delimiter='auto'){
 let parsed,sep=delimiter;
 if(sep==='auto'){
  const candidates=[',',';','\t','|'].map(d=>{try{const rows=parseCSV(text,d);const score=Math.max(0,...rows.slice(0,35).map(r=>{const m=guessMapping(r.cells),hits=Object.values(m).filter(i=>i>=0).length;return hits*100+Math.min(r.cells.length,30);}));return{d,rows,score};}catch{return{d,score:-1};}}).sort((a,b)=>b.score-a.score);
  if(candidates[0].score<0)throw Error('לא ניתן לפרוס את הקובץ. בדוק את מפריד העמודות ואת המרכאות.');
  ({d:sep,rows:parsed}=candidates[0]);
 }else parsed=parseCSV(text,sep);
 if(!parsed.length)throw Error('הקובץ ריק.');
 let headerIndex=0,best=-1;
 parsed.slice(0,35).forEach((r,i)=>{const m=guessMapping(r.cells),hits=Object.values(m).filter(n=>n>=0).length,score=hits*10+(m.date>=0?5:0);if(score>best){headerIndex=i;best=score;}});
 return {rows:parsed,delimiter:sep,headerIndex,mapping:guessMapping(parsed[headerIndex].cells)};
}
export function parseMoney(value,decimal='auto'){
 let s=clean(value);if(!s||s==='-'||s==='—')return null;
 s=s.replace(/(?:₪|ש[״"]?ח|ILS|NIS|USD|EUR|\$|€)/gi,'').replace(/[\s\u00a0]/g,'');
 let negative=false;
 if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
 if(s.endsWith('-')){if(negative)throw Error('סימן סכום כפול');negative=true;s=s.slice(0,-1);}
 if(/^[+-]/.test(s)){if(negative)throw Error('סימן סכום כפול');negative=s[0]==='-';s=s.slice(1);}
 // Text exports may use either locale. Infer separators, never strip punctuation
 // indiscriminately: grouping must still consist of complete three-digit groups.
 // A lone separator followed by three digits denotes grouping; explicit locale
 // modes remain available, and typed XLSX numbers always use strict dot mode.
 if(!['auto','dot','comma'].includes(decimal))throw Error('פורמט סכום לא תקין');
 if(decimal==='auto'){
  const dot=s.lastIndexOf('.'),comma=s.lastIndexOf(',');
  if(dot>=0&&comma>=0)decimal=dot>comma?'dot':'comma';
  else if(dot>=0||comma>=0){
   const separator=dot>=0?'.':',',parts=s.split(separator);
   const fractional=parts.length===2&&/^\d{1,2}$/.test(parts[1]);
   const point=fractional?separator:(separator==='.'?',':'.');
   decimal=point===','?'comma':'dot';
  }else decimal='dot';
 }
 const grouping=decimal==='comma'?'.':',',point=decimal==='comma'?',':'.';
 const parts=s.split(point);if(parts.length>2||!/^[0-9]{1,2}$/.test(parts[1]??'0'))throw Error('סכום לא תקין');
 let whole=parts[0];
 if(whole.includes(grouping)){const groups=whole.split(grouping);if(!/^[0-9]{1,3}$/.test(groups[0])||groups.slice(1).some(g=>!/^\d{3}$/.test(g)))throw Error('מפריד אלפים לא תקין');whole=groups.join('');}
 if(!/^\d+$/.test(whole))throw Error('סכום לא תקין');
 const cents=Number(whole)*100+Number((parts[1]??'').padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>10000000000)throw Error('סכום מחוץ לטווח');
 return negative?-cents:cents;
}
export function parseDate(value,format='day-first'){
 const s=clean(value).replace(/^(?:יום\s+)?[אבגדהוש][׳']\s*(?=\d)/,'');let y,m,d,match;
 if((match=/^(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)))[,y,m,d]=match;
 else if((match=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))){[,d,m,y]=match;if(format==='month-first')[m,d]=[d,m];if(y.length===2)y='20'+y;}
 else throw Error('תאריך לא תקין');
 y=Number(y);m=Number(m);d=Number(d);const date=new Date(Date.UTC(y,m-1,d));
 if(y<1900||y>2099||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('תאריך לא תקין');
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
const currencyOf=s=>{const v=clean(s).toUpperCase();if(['₪','ILS','NIS','שח','ש״ח','ש"ח'].includes(v))return 'ILS';if(['$','USD'].includes(v))return 'USD';if(['€','EUR'].includes(v))return 'EUR';return v||null;};
export function normalizeRows(inspection,options={}){
 const {rows}=inspection,headerIndex=options.headerIndex??inspection.headerIndex,headers=rows[headerIndex]?.cells;
 if(!headers)throw Error('בחר שורת כותרות קיימת.');
 const mapping=options.mapping??guessMapping(headers),mode=options.mode??(mapping.debit>=0||mapping.credit>=0?'split':'signed');
 const used=Object.entries(mapping).filter(([field,i])=>i>=0&&!(mode==='split'?['amount','direction'].includes(field):['credit','debit'].includes(field)));
 if(used.some(([,i])=>!Number.isInteger(i)||i>=headers.length))throw Error('מיפוי עמודות לא תקין.');
 if(new Set(used.map(([,i])=>i)).size!==used.length)throw Error('אותה עמודה מופתה לשני שדות. בחר עמודה נפרדת לכל שדה.');
 if(mapping.date<0)throw Error('בחר עמודת תאריך.');
 if(mode==='split'&&mapping.debit<0&&mapping.credit<0||mode==='signed'&&mapping.amount<0)throw Error('בחר עמודת סכום או עמודות חובה וזכות.');
 const period=options.period;
 let periodStart,periodEnd;
 if(period){
  try{
   // Retain month-range compatibility for earlier inspection reports.
   const boundary=(value,last)=>{
    if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)){
     if(!last)return value+'-01';
     const [y,m]=value.split('-').map(Number);return value+'-'+new Date(Date.UTC(y,m,0)).getUTCDate();
    }
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(value)||parseDate(value)!==value)throw Error();return value;
   };
   periodStart=boundary(period.from,false);periodEnd=boundary(period.to,true);if(periodStart>periodEnd)throw Error();
  }catch{throw Error('בחר טווח תאריכים תקין לבדיקה.');}
 }
 const seen=new Set();
 const records=rows.slice(headerIndex+1).map(row=>{
  const record={line:row.line,raw:[...(row.sourceCells??row.cells)],date:null,description:clean(row.cells[mapping.description]),details:clean(row.cells[mapping.details]),valueDate:null,beneficiary:clean(row.cells[mapping.beneficiary]),purpose:clean(row.cells[mapping.purpose]),debitCents:null,creditCents:null,reference:clean((row.sourceCells??row.cells)[mapping.reference]),currency:null,amountCents:null,balanceCents:null,issues:[],warnings:[]};
  const get=field=>clean(row.cells[mapping[field]]);
  const getMoney=field=>parseMoney(get(field),row.numericColumns?.includes(mapping[field])?'dot':options.decimal);
  for(const issue of row.cellIssues??[])if(used.some(([,column])=>column===issue.column))record.issues.push(issue.message);
  if(row.cells.length!==headers.length)record.issues.push(`מספר העמודות (${row.cells.length}) שונה משורת הכותרות (${headers.length})`);
  try{record.date=parseDate(get('date'),options.dateFormat);}catch{record.issues.push('תאריך חסר או לא תקין');}
  if(mapping.valueDate>=0&&get('valueDate')){try{record.valueDate=parseDate(get('valueDate'),options.dateFormat);}catch{record.warnings.push('תאריך ערך לא תקין; הסיכום משתמש בתאריך התנועה');}}
  try{
   if(mode==='split'){
    const debit=getMoney('debit'),credit=getMoney('credit');
    if(debit===null&&credit===null)throw Error('חסר סכום');
    if((debit<0||credit<0)&&inspection.format!=='pdf')throw Error('חובה וזכות צריכות להיות חיוביות; בדוק את מיפוי הסימנים');
    if(debit&&credit)throw Error('גם חובה וגם זכות בשורה אחת');
    record.debitCents=debit;record.creditCents=credit;
    record.amountCents=(credit??0)-(debit??0);if(inspection.format==='pdf'&&(debit<0||credit<0)){if(credit<0)throw Error('ביטול זיכוי דורש בירור לפני קליטה');record.reversal=true;}
   }else{
    record.amountCents=getMoney('amount');if(record.amountCents===null)throw Error('חסר סכום');
    if(mapping.direction>=0){const direction=key(get('direction'));if(['חובה','חיוב','debit','d','dr','withdrawal'].includes(direction))record.amountCents=-Math.abs(record.amountCents);else if(['זכות','זיכוי','credit','c','cr','deposit'].includes(direction))record.amountCents=Math.abs(record.amountCents);else throw Error('סוג חובה/זכות לא מזוהה');}
    else if(options.invertSign)record.amountCents=-record.amountCents;
   }
  }catch(e){record.issues.push(e.message);record.amountCents=null;}
  if(mode==='signed'&&record.amountCents!==null){record.debitCents=Math.max(0,-record.amountCents);record.creditCents=Math.max(0,record.amountCents);}
  if(mapping.balance>=0){try{record.balanceCents=getMoney('balance');}catch{record.issues.push('יתרה לא תקינה');}}
  record.currency=currencyOf(get('currency'))??(options.defaultCurrency??'ILS');
  if(mapping.currency<0&&!options.defaultCurrency)record.warnings.push('מטבע לא נרשם בקובץ; הונח שקל');
  // A currency symbol in any mapped financial cell must agree with the chosen currency.
  const moneyCells=(mode==='split'?['debit','credit','balance']:['amount','balance']).filter(f=>mapping[f]>=0).map(f=>clean((row.sourceCells??row.cells)[mapping[f]])).join(' ');
  const symbols=[[/\$|\bUSD\b/i,'USD'],[/€|\bEUR\b/i,'EUR'],[/₪|\bILS\b|\bNIS\b/i,'ILS']].filter(([re])=>re.test(moneyCells)).map(([,c])=>c);
  if(symbols.some(c=>c!==record.currency))record.issues.push('סימן המטבע בסכום אינו תואם למטבע שנבחר');
  if(record.currency!=='ILS')record.warnings.push('אינו בשקלים; לא נכלל בסיכום השקלי');
  record.inPeriod=!period||!!record.date&&record.date>=periodStart&&record.date<=periodEnd;
  if(record.date&&!record.inPeriod)record.warnings.push('מחוץ לתקופה שנבחרה; לא נכלל בסיכום');
  const signature=JSON.stringify([record.date,record.description,record.details,record.valueDate,record.beneficiary,record.purpose,record.reference,record.amountCents,record.balanceCents,record.currency]);
  if(!record.issues.length){if(seen.has(signature))record.warnings.push('כפילות אפשרית; השורה לא הוסרה');seen.add(signature);}
  record.valid=record.issues.length===0;if(inspection.format==='pdf'&&inspection.pdfReconciliation?.verified)record.pdfOrder=row.line;return record;
 });
 const months=new Map();let creditCents=0,debitCents=0,count=0;
 for(const r of records)if(r.valid&&r.currency==='ILS'&&r.inPeriod){
  count++;const month=r.date.slice(0,7),item=months.get(month)??{month,count:0,creditCents:0,debitCents:0};item.count++;
  if(r.amountCents>=0){creditCents+=r.amountCents;item.creditCents+=r.amountCents;}else{debitCents-=r.amountCents;item.debitCents-=r.amountCents;}months.set(month,item);
 }
 const balances=records.filter(r=>r.valid&&r.currency==='ILS'&&r.inPeriod&&r.balanceCents!==null).sort((a,b)=>b.date.localeCompare(a.date));
 const latest=balances.filter(r=>r.date===balances[0]?.date),unique=new Set(latest.map(r=>r.balanceCents));
 const balanceCandidate=unique.size===1?{date:latest[0].date,balanceCents:latest[0].balanceCents}:null;
 return{headers,headerLine:rows[headerIndex].line,skippedPreamble:headerIndex,records,summary:{count,invalid:records.filter(r=>!r.valid).length,outsidePeriod:records.filter(r=>r.date&&!r.inPeriod).length,warnings:records.filter(r=>r.warnings.length).length,creditCents,debitCents,netCents:creditCents-debitCents,months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),balanceCandidate,balanceAmbiguous:unique.size>1}};
}
