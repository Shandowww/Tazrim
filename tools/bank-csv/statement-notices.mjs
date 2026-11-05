export const statementNoticeCategories={charge:'חיוב או עמלה צפויים',account:'נדרש טיפול בחשבון',promotion:'הטבה או מבצע',terms:'שינוי בתנאים',update:'עדכון מהמנפיק'};
export const normalizeNoticeText=value=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
const heading=/^(?:הודעות(?: חשובות)?|מידע חשוב|לידיעתך|לתשומת לבך|עדכונים|הטבות(?: ומבצעים)?|מבצעים|שינויים בתנאים|important (?:information|notices)|notices|promotions|updates)\s*[:：־-]?$/i;
const table=/^(?:פירוט (?:עסקאות|תנועות|חיובים)|סיכום (?:עסקאות|תנועות)|תאריך עסקה|transaction details|account transactions)/i;
export function issuerNoticeIdentity(text){
 const normalized=normalizeNoticeText(text),issuer=[['isracard',/ישראכרט|isracard/i],['cal',/כאל|ויזה כ\.א\.ל|cal-online/i],['max',/מקס|\bmax\b/i],['hapoalim',/הפועלים|hapoalim/i],['onezero',/וואן זירו|one\s*zero/i],['leumi',/לאומי|leumi/i],['discount',/דיסקונט|discount bank/i],['mizrahi',/מזרחי|mizrahi/i]].find(([,pattern])=>pattern.test(normalized))?.[0]??'unknown';
 const account=normalized.match(/מספר\s*(?:ה)?חשבון\s*[:־-]?\s*([0-9-]{6,20})/);
 return{issuer,accountReference:account?'account:'+account[1].replaceAll('-',''):null};
}
function category(text){
 if(/(?:יש|נדרש|עליך|עליכם) (?:להסדיר|לעדכן|ליצור קשר|לטפל)|חריגה ממסגרת|פיגור בתשלום|חשבון.*(?:חסום|מוגבל)|action required|overdue|account.*(?:blocked|suspended)/i.test(text))return 'account';
 if(/שינוי(?:ים)? ב(?:תנאי|תעריפ|הסכם)|עדכון (?:תנאי|תעריפ)|תנאים חדשים|changes? to (?:terms|conditions)|terms.*(?:change|update)/i.test(text))return 'terms';
 if(/הטבה|מבצע|קופון|הנחה|promoti(?:on|onal)|special offer|discount/i.test(text))return 'promotion';
 if(/(?:תחויב|תחויבו|ייגבה|תגבה|צפוי להיגבות|חיוב צפוי|עמלה.*(?:החל|תחויב|תיגבה)|upcoming (?:charge|fee)|will be charged)/i.test(text))return 'charge';
 return 'update';
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
  const rows=page.text.split(/\r?\n/).map(normalizeNoticeText).filter(Boolean);let section=false,block=[];
  const flush=()=>{const text=block.join(' ').trim();block=[];if(text.length<12||seen.has(text))return;seen.add(text);const kind=category(text);notices.push({category:kind,issuer,accountReference,text,page:page.page,dates:explicitDates(text),amounts:[...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?\s*(?:₪|ש[״"]ח|ILS)/g)].map(match=>match[0]).slice(0,8),attention:kind==='account'||kind==='charge'||kind==='terms',needsReview:true})};
  for(const row of rows){
   if(/^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?[ ,;]/.test(row)){flush();continue}
   if(heading.test(row)){flush();section=true;continue}
   if(table.test(row)){flush();section=false;continue}
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
 return pages.map((page,index)=>{
  const rows=[];
  for(const item of page.items??[]){if(typeof item.str!=='string'||!item.str.trim())continue;const vertical=item.transform?.[5]??0;let row=rows.find(candidate=>Math.abs(candidate.vertical-vertical)<2);if(!row){row={vertical,items:[]};rows.push(row)}row.items.push(item)}
  return{page:index+1,text:rows.sort((left,right)=>right.vertical-left.vertical).map(row=>row.items.sort((left,right)=>(right.transform?.[4]??0)-(left.transform?.[4]??0)).map(item=>item.str).join(' ')).join('\n')};
 });
}
