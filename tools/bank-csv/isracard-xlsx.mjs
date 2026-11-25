import {parseDate,parseMoney} from './parser.mjs';

const clean=value=>String(value??'').normalize('NFKC')
 .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
const months=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const headers=['תאריך רכישה','שם בית עסק','סכום עסקה','מטבע עסקה','סכום חיוב','מטבע חיוב',"מס' שובר",'פירוט נוסף'];
const cardHeader=/^(?:אמריקן אקספרס|american express|ישראכרט|isracard)(?: [^\d]{1,60}?)?\s*[-–־]\s*(\d{4})$/i;
const totalLabel=/^סה["״]כ לחיוב החודש בכרטיס בש["״]ח$/;
const currencies=new Map([['₪','ILS'],['ש"ח','ILS'],['ש״ח','ILS'],['ILS','ILS'],['NIS','ILS'],['$','USD'],['USD','USD'],['€','EUR'],['EUR','EUR'],['£','GBP'],['GBP','GBP']]);
const currency=value=>currencies.get(value?.toUpperCase());
const single=(values,message)=>{
 if(values.length!==1)throw Error(message);
 return values[0];
};
const amount=value=>{
 if(!/^[\d.,+()\s-]+$/.test(value))throw Error('חסר סכום מספרי בדוח הכרטיס.');
 return value;
};
const amountAt=(row,column)=>parseMoney(amount(row.values[column]),row.numericColumns?.includes(column)?'dot':'auto');

// Isracard Group's card-site export prints the billing month and debit day
// separately. The two printed totals and the billed ILS column must agree.
export function parseIsracardSpreadsheet(inspections){
 const workbook=inspections.find(inspection=>['xls','xlsx'].includes(inspection.format)&&
  inspection.rows.some(row=>row.cells.some(cell=>clean(cell)==='עסקאות למועד חיוב'))&&
  inspection.rows.some(row=>row.cells.some(cell=>clean(cell)==='תאריך רכישה')));
 if(!workbook)return null;
 if(inspections.length!==1||workbook.rows.length>5010)throw Error('יש להעלות דוח Excel של כרטיס ומועד חיוב אחד.');

 const rows=workbook.rows.map(row=>({...row,values:row.cells.map(clean)}));
 const header=single(rows.filter(row=>headers.every(label=>row.values.includes(label))),'עמודות החיוב בדוח אינן חד־משמעיות.');
 const columns=headers.map(label=>single(header.values.flatMap((value,index)=>value===label?[index]:[]),'עמודת חיוב מופיעה יותר מפעם אחת.'));
 const [purchase,merchant,original,originalUnit,billed,billedUnit,,extra]=columns;
 const index=rows.indexOf(header),metadata=rows.slice(0,index),metadataValues=metadata.flatMap(row=>row.values);
 if(rows.some(row=>row.cellIssues?.length))throw Error('בדוח יש נוסחה או תא שאינו קריא. יש להעלות ערכים מקוריים ממנפיק הכרטיס.');
 single(metadataValues.filter(value=>value==='עסקאות למועד חיוב'),'לא זוהה מועד חיוב יחיד בדוח.');
 const title=single(metadata.filter(row=>row.values.includes('פירוט עסקאות')),'לא זוהה חודש הדוח.');
 const [,monthName,year]=single(title.values.map(value=>/^([א-ת]+) (20\d{2})$/.exec(value))
  .filter(match=>match&&months.includes(match[1])),'לא זוהה חודש הדוח.');
 const billedMonth=months.indexOf(monthName)+1;
 const dateLabel=single(metadataValues.filter(value=>/^לחיוב ב\s*[-–־]/.test(value)),'לא זוהה תאריך חיוב יחיד בדוח.');
 const dateMatch=/^לחיוב ב\s*[-–־]\s*(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}|\d{2}))?$/.exec(dateLabel);
 if(!dateMatch)throw Error('תאריך החיוב בדוח הכרטיס אינו קריא.');
 const [,day,month,printedYear]=dateMatch;
 if(Number(month)!==billedMonth||printedYear&&Number(printedYear)!==Number(printedYear.length===2?year.slice(2):year))throw Error('תאריך החיוב אינו תואם לחודש הדוח.');
 const dueDate=parseDate(`${day}/${month}/${year}`);
 const cards=metadata.filter(row=>row.values.some(value=>cardHeader.test(value)));
 const card=single(cards,'לא זוהו ארבע ספרות של כרטיס אחד בדוח.');
 const [,last4]=single(card.values.map(value=>cardHeader.exec(value)).filter(Boolean),'נמצא יותר מכרטיס אחד בדוח.');
 const printedTotal=single(card.values.filter(value=>/^₪\s*.+$|^.+\s*₪$/.test(value)),'חסר סכום החיוב בכותרת הכרטיס.');

 const total=single(rows.filter(row=>row.values.some(value=>totalLabel.test(value))),'חסר סיכום שקלי יחיד בדוח הכרטיס.');
 const totalIndex=rows.indexOf(total);
 if(totalIndex<=index||currency(total.values[billedUnit])!=='ILS'||rows.slice(totalIndex+1).some((row,i)=>
  i!==0||row.values.filter(Boolean).length!==1||!row.values.some(value=>/^תנאים משפטיים(?: |$)/.test(value))))throw Error('לא זוהה סיום ברור לטבלת החיוב.');
 const amountCents=amountAt(total,billed);
 if(amountCents===null||amountCents<0||parseMoney(amount(printedTotal.replace('₪','').trim()))!==amountCents)throw Error('סכומי החיוב המודפסים אינם תואמים.');

 const entries=rows.slice(index+1,totalIndex).map(row=>{
  const date=parseDate(row.values[purchase]),name=row.values[merchant],notes=row.values[extra];
  const amount=amountAt(row,billed),sourceAmount=amountAt(row,original),sourceCurrency=currency(row.values[originalUnit]);
  if(date>dueDate||!name||name.length>100||notes.length>2000||amount===null||sourceAmount===null||
   currency(row.values[billedUnit])!=='ILS'||!sourceCurrency)throw Error('נמצאה עסקה עם תאריך, סכום או מטבע שאינם מתאימים לדוח הכרטיס.');
  const source=sourceCurrency==='ILS'?{originalCents:sourceAmount}:{originalCents:amount,foreignCents:sourceAmount};
  return {date,merchant:name,amountCents:amount,...source,originalCurrency:sourceCurrency,notes};
 });
 if(!entries.length||entries.length>5000||entries.reduce((sum,row)=>sum+row.amountCents,0)!==amountCents)
  throw Error('סכומי העסקאות אינם תואמים לסך החיוב. יש להעלות דוח מלא.');
 return {issuer:'isracard',dueDate,amount:amountCents/100,count:entries.length,last4,entries};
}
