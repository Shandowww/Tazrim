import {calPDFNoticePages} from './cal-pdf.mjs';
export const statementNoticeCategories={charge:'חיוב או עמלה צפויים',account:'נדרש טיפול בחשבון',promotion:'הטבה או מבצע',terms:'שינוי בתנאים',limit:'עדכון מסגרת אשראי',interest:'עדכון ריבית',points:'צבירת נקודות',club:'הטבות מועדון',update:'עדכון מהמנפיק'};
export const normalizeNoticeText=value=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
const heading=/^(?:הודעות(?: חשובות)?|מידע חשוב|לידיעתך|לתשומת לבך|עדכונים|הטבות(?: ומבצעים| מועדון)?|מבצעים|נקודות והטבות|הודעות לחברי המועדון|שינויים בתנאים|important (?:information|notices)|notices|promotions|updates)\s*[:：־-]?$/i;
const table=/^(?:פירוט (?:עסקאות|תנועות|חיובים)|סיכום (?:עסקאות|תנועות)|תאריך עסקה|transaction details|account transactions)/i;
export function issuerNoticeIdentity(text){
 const normalized=normalizeNoticeText(text),issuer=[['isracard',/ישראכרט|isracard/i],['cal',/כאל|ויזה כ\.א\.ל|cal-online/i],['max',/מקס|\bmax\b/i],['hapoalim',/הפועלים|hapoalim/i],['onezero',/וואן זירו|one\s*zero/i],['leumi',/לאומי|leumi/i],['discount',/דיסקונט|discount bank/i],['mizrahi',/מזרחי|mizrahi/i]].find(([,pattern])=>pattern.test(normalized))?.[0]??'unknown';
 const account=normalized.match(/מספר\s*(?:ה)?חשבון\s*[:־-]?\s*([0-9-]{6,20})/);
 return{issuer,accountReference:account?'account:'+account[1].replaceAll('-',''):null};
}
const changed=/שינוי|שינויים|עדכון|מעודכנ|מתעדכנ|עודכנ|עודכן|תעודכ|יתעדכ|הוגדל|הוקטנ|תוגדל|תוקטן|הופחת|עלתה|ירדה|החל מ|changes?|updated?|increased?|reduced?|effective/i;
function category(text){
 if(/(?:יש|נדרש|עליך|עליכם) (?:להסדיר|לעדכן|ליצור קשר|לטפל)|חריגה ממסגרת|פיגור בתשלום|חשבון.*(?:חסום|מוגבל)|action required|overdue|account.*(?:blocked|suspended)/i.test(text))return 'account';
 if(/מסגרת (?:הכרטיס|האשראי|אשראי)|credit limit/i.test(text)&&changed.test(text))return 'limit';
 if(/ריבית|פריים|interest rate|prime rate/i.test(text)&&changed.test(text))return 'interest';
 if(/(?:צברת|נצברו|צברתם|צבירת|יתרת|זכותך|לזכותכם).{0,60}נקודות|נקודות.{0,60}(?:שנצברו|שצברת|לזכותך|יתרת|צבירה)|points? (?:balance|earned)|earned.{0,30}points?/i.test(text))return 'points';
 if(/מועדון|club/i.test(text)&&/הטב|זכא|מימוש|חבר|הנח|קופון|benefit|reward|member|discount/i.test(text))return 'club';
 if(/שינוי(?:ים)? ב(?:תנאי|תעריפ|הסכם)|עדכון (?:תנאי|תעריפ)|תנאים חדשים|changes? to (?:terms|conditions)|terms.*(?:change|update)/i.test(text))return 'terms';
 if(/הטב(?:ה|ות)|קופון|הנחה|(?:^|\s)(?:ה)?מבצע(?:ים)?(?=$|[\s:])|promoti(?:on|onal)|special offer|discount/i.test(text))return 'promotion';
 if(/(?:תחויב|תחויבו|ייגבה|תגבה|צפוי להיגבות|חיוב צפוי|עמלה.*(?:החל|תחויב|תיגבה)|upcoming (?:charge|fee)|will be charged)/i.test(text))return 'charge';
 return 'update';
}
const attention=kind=>['account','charge','terms','limit','interest'].includes(kind);
function transactionRow(text){
 // "המבצע:" identifies the transfer's actor, never a promotional offer.
 if(/^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?[ ,;]/.test(text))return true;
 const salary=/^(?:\d{3,}\s+)?(?:זיכוי\s+)?(?:העברת\s+)?(?:משכורת|שכר)(?:[-־–\s]|$)/.test(text);
 const monetary=(text.match(/\d[\d,]*\.\d{2}(?!\d)/g)??[]).length;
 const columns=monetary>=1&&(/^["״]?\d{3,}[\s,;]/.test(text)||/(?:חובה|זכות|יתרה|אסמכת[אה])\s*[:：]/.test(text));
 if(/(?:^|[\s"״])המבצע\s*[:：]/.test(text)&&(salary||columns||!/הנחה|הטב(?:ה|ות)|קופון|מימוש|בתוקף|תקף עד/.test(text)))return true;
 if(salary&&!/זכאי|זכאות|מזכה|הטבה|הטבות/.test(text))return true;
 return columns&&/משכורת|העברה|זיכוי|יתרה|תשלום|רכישה|עמלה|חיוב/.test(text);
}
/** Revalidate old stored discoveries at read time; never rewrite the scan or finances. */
export function currentStatementNotices(notices){
 return (notices??[]).flatMap(notice=>{
  const text=normalizeNoticeText(notice.text);if(!text||transactionRow(text))return[];
  const kind=category(text);if(kind==='update'&&notice.category!=='update')return[];
  return[{...notice,category:kind,attention:attention(kind)}];
 });
}
function explicitDates(text){
 const dates=[];
 for(const match of text.matchAll(/(?:החל מ(?:תאריך)?|בתאריך|עד לתאריך|בתוקף עד|מועד החיוב|effective(?: from)?|due(?: date)?|expires?)\s*[:־-]?\s*(\d{1,2})[./](\d{1,2})[./](20\d{2})/gi)){
  const date=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
  if(Number.isFinite(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date)dates.push({date,wording:match[0]});
 }
 return dates.slice(0,8);
}
export function extractStatementNotices(pages){
 if(!Array.isArray(pages)||pages.length>20||pages.some(page=>typeof page?.text!=='string'||!Number.isInteger(page.page)||page.page<1||page.page>20)||new Set(pages.map(page=>page.page)).size!==pages.length||pages.reduce((sum,page)=>sum+page.text.length,0)>200000)throw Error('טקסט הדוח אינו בגודל או במבנה נתמך.');
 const allText=pages.map(page=>normalizeNoticeText(page.text)).join(' '),{issuer,accountReference}=issuerNoticeIdentity(allText);
 const notices=[],seen=new Set();
 for(const page of pages){
  const rows=page.text.split(/\r?\n/).map(normalizeNoticeText).filter(Boolean);let section=false,inTable=false,block=[];
  const flush=()=>{const text=block.join(' ').trim();block=[];if(text.length<12||seen.has(text)||transactionRow(text))return;seen.add(text);const kind=category(text);notices.push({category:kind,issuer,accountReference,text,page:page.page,dates:explicitDates(text),amounts:[...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?\s*(?:₪|ש[״"]ח|ILS)/g)].map(match=>match[0]).slice(0,8),attention:attention(kind),needsReview:true})};
  for(const row of rows){
   if(heading.test(row)){flush();section=true;inTable=false;continue}
   if(table.test(row)||transactionRow(row)){flush();section=false;inTable=true;continue}
   if(inTable)continue;
   if(/^[•●]\s*/.test(row))flush();
   const kind=category(row),explicit=kind!=='update'&&row.length>=20;
   if(!section&&!explicit){flush();continue}
   if(explicit&&block.length)flush();
   if(row.length>1500){flush();continue}
   if(block.join(' ').length+row.length>1800)flush();block.push(row);
  }
  flush();
 }
 if(notices.length>40)throw Error('נמצאו הודעות רבות מדי. יש לבדוק את המקור ידנית.');
 return{version:1,issuer,notices};
}
export function pdfNoticePages(pages){
 const cal=calPDFNoticePages(pages);if(cal)return cal;
 return pages.map((page,index)=>{
  const rows=[];
  for(const item of page.items??[]){if(typeof item.str!=='string'||!item.str.trim())continue;const vertical=item.transform?.[5]??0;let row=rows.find(candidate=>Math.abs(candidate.vertical-vertical)<2);if(!row){row={vertical,items:[]};rows.push(row)}row.items.push(item)}
  return{page:index+1,text:rows.sort((left,right)=>right.vertical-left.vertical).map(row=>row.items.sort((left,right)=>(right.transform?.[4]??0)-(left.transform?.[4]??0)).map(item=>item.str).join(' ')).join('\n')};
 });
}
