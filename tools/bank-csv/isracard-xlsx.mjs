import {parseDate,parseMoney} from './parser.mjs';

const clean=value=>String(value??'').normalize('NFKC')
 .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
const months=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const headers=['תאריך רכישה','שם בית עסק','סכום עסקה','מטבע עסקה','סכום חיוב','מטבע חיוב',"מס' שובר",'פירוט נוסף'];
const cardHeader=/^(?:אמריקן אקספרס|american express|ישראכרט|isracard|פלטינה מסטרקארד)(?: [^\d]{1,60}?)?\s*[-–־]\s*(\d{4})$/i;
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

const cardTotalLabel=/^₪\s*.+$|^.+\s*₪$/;
const metadataCardSuffix=value=>cardHeader.exec(value)?.[1]??(/(?:כרטיס|מאסטרקארד|מסטרקארד|mastercard|ויזה|visa)/i.test(value)?/[-–־]\s*(\d{4})$/.exec(value)?.[1]:undefined);
function mappedCell(rows,key){
 const match=/^(\d{1,4}):(\d{1,3})$/.exec(key??'');
 const row=match&&rows.find(row=>row.line===Number(match[1])),value=row&&row.values[Number(match[2])];
 if(!row||!value)throw Error('בחרו ערך קיים מכותרת הדוח.');
 return {row,value};
}
export function isracardMetadataOptions(inspection){
 if(!['xls','xlsx'].includes(inspection.format))return null;
 const index=inspection.rows.findIndex(row=>headers.every(label=>row.cells.map(clean).includes(label)));
 if(index<1||index>35||!inspection.rows.slice(0,index).some(row=>row.cells.map(clean).includes('עסקאות למועד חיוב')))return null;
 const options={card:[],date:[],total:[]};
 for(const row of inspection.rows.slice(0,index))for(const [column,raw] of row.cells.entries()){
  const label=clean(raw),value=row.line+':'+column,choice={value,label};
  if(metadataCardSuffix(label))options.card.push(choice);
  if(/^(?:לחיוב ב\s*[-–־]\s*)?\d{1,2}[./-]\d{1,2}(?:[./-](?:20\d{2}|\d{2}))?$/.test(label))options.date.push(choice);
  if(cardTotalLabel.test(label))options.total.push(choice);
 }
 return Object.values(options).every(items=>items.length&&items.length<=30)?options:null;
}

// Isracard Group's card-site export prints the billing month and debit day
// separately. The two printed totals and the billed ILS column must agree.
export function parseIsracardSpreadsheet(inspections,metadataChoices){
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
 const dateLabels=metadataValues.filter(value=>/^לחיוב ב\s*[-–־]/.test(value));
 const printedDatePattern=/^(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}|\d{2}))?$/;
 const dateText=metadataChoices?mappedCell(metadata,metadataChoices.date).value:single(dateLabels,'לא זוהה תאריך חיוב יחיד בדוח.');
 if(metadataChoices&&(dateLabels.length>1||dateLabels.length===1&&dateLabels[0]!==dateText))throw Error('יש לבחור את מועד החיוב המסומן בכותרת.');
 const dateMatch=printedDatePattern.exec(dateText.replace(/^לחיוב ב\s*[-–־]\s*/,''));
 if(!dateMatch)throw Error('תאריך החיוב בדוח הכרטיס אינו קריא.');
 const [,day,month,printedYear]=dateMatch;
 if(Number(month)!==billedMonth||printedYear&&Number(printedYear)!==Number(printedYear.length===2?year.slice(2):year))throw Error('תאריך החיוב אינו תואם לחודש הדוח.');
 const dueDate=parseDate(`${day}/${month}/${year}`);
 const cards=metadata.filter(row=>row.values.some(value=>cardHeader.test(value)));
 let last4,printedTotal,cardTitle;
 if(metadataChoices){
  const card=mappedCell(metadata,metadataChoices.card),total=mappedCell(metadata,metadataChoices.total);
  const known=cards.flatMap(row=>row.values.map(value=>cardHeader.exec(value)).filter(Boolean));
  const suffix=metadataCardSuffix(card.value);
  if(!suffix||card.row!==total.row||!cardTotalLabel.test(total.value)||known.length>1||known.length===1&&known[0][1]!==suffix)throw Error('בחרו מספר כרטיס וסכום חיוב מאותה כותרת.');
  const possibleCards=metadata.filter(row=>row.values.some(value=>metadataCardSuffix(value))&&row.values.some(value=>cardTotalLabel.test(value)));
  if(possibleCards.length!==1||possibleCards[0]!==card.row||card.row.values.filter(metadataCardSuffix).length!==1||card.row.values.filter(value=>cardTotalLabel.test(value)).length!==1)throw Error('לא זוהתה כותרת יחידה של כרטיס וסכום.');
  cardTitle=card.value;last4=suffix;printedTotal=total.value;
 }else{
  const card=single(cards,'לא זוהו ארבע ספרות של כרטיס אחד בדוח.');
  cardTitle=single(card.values.filter(value=>cardHeader.test(value)),'נמצא יותר מכרטיס אחד בדוח.');
  last4=cardHeader.exec(cardTitle)[1];
  printedTotal=single(card.values.filter(value=>cardTotalLabel.test(value)),'חסר סכום החיוב בכותרת הכרטיס.');
 }

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
 const label=cardTitle.replace(/\s*[-–־]\s*\d{4}$/, '').trim();
 const cardName=/^[\p{L} '"״׳–־-]{1,60}$/u.test(label)?label:'';
 const network=/אמריקן אקספרס|american express/i.test(label)?'amex':/מא?סטרקארד|mastercard/i.test(label)?'mastercard':/ויזה|visa/i.test(label)?'visa':'';
 return {...(cardName?{cardName}:{}),...(network?{network}:{}),issuer:'isracard',dueDate,amount:amountCents/100,count:entries.length,last4,entries};
}
