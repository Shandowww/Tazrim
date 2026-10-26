import {parseDate,parseMoney,LIMITS} from './parser.mjs';
const clean=value=>String(value??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
const norm=value=>clean(value).replace(/[\s:״”"׳']/g,'');
const x=i=>i.transform[4],y=i=>i.transform[5],right=i=>x(i)+i.width;
function lines(items){const rows=[];for(const item of [...items].sort((a,b)=>y(b)-y(a)||x(b)-x(a))){let row=rows.find(row=>Math.abs(row.y-y(item))<1.5);if(!row){row={y:y(item),items:[]};rows.push(row);}row.items.push(item);}return rows.sort((a,b)=>b.y-a.y);}
function text(items){return lines(items).map(row=>{const latin=row.items.every(i=>!/[א-ת]/.test(i.str));return row.items.sort((a,b)=>latin?x(a)-x(b):x(b)-x(a)).map(i=>clean(i.str)).join(' ');}).join(' ').trim();}
const datePattern=/^\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?$/;
function amountAt(items,edge){const candidates=items.filter(i=>Math.abs(right(i)-edge)<7&&/^[+\-\d,.()]+$/.test(clean(i.str)));if(candidates.length!==1)throw Error('סכום החיוב בשקלים אינו חד־משמעי בדוח ישראכרט.');const amount=parseMoney(clean(candidates[0].str));if(amount===null)throw Error('חסר סכום חיוב בדוח ישראכרט.');return{amount,item:candidates[0]};}
// Original PDF geometry is kept local. Only reconciled billed ILS becomes an expense.
export function inspectIsracardPDF(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>20)throw Error('אפשר לקרוא דוח PDF עם 1–20 עמודים.');
 const all=pages.flatMap((page,index)=>page.items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(item=>({...item,page:index+1}))),brand=all.some(i=>/ישראכרט|isracard/i.test(i.str));
 if(!brand)return null;
 if(all.length>100000||all.some(i=>Math.abs(i.transform[1])>.01||Math.abs(i.transform[2])>.01))throw Error('מבנה PDF ישראכרט מסובב או גדול מדי. בחרו דוח מקורי.');
 const metadata=pages.flatMap(page=>lines(page.items.filter(i=>i.str?.trim()))),cycle=metadata.filter(row=>/פרוטפעולותיךלתאריך|פירוטפעולותיךלתאריך/.test(norm(text(row.items))));
 if(!cycle.length&&!metadata.some(row=>/שםבית(?:ה)?עסק/.test(norm(text(row.items)))))return null;
 if(cycle.length!==1)throw Error('יש להעלות דוח ישראכרט של כרטיס ומועד חיוב אחד.');
 const date=cycle[0].items.filter(i=>datePattern.test(clean(i.str)));if(date.length!==1)throw Error('לא זוהה מועד חיוב ברור בדוח ישראכרט.');const cycleDate=parseDate(clean(date[0].str));let dueDate;
 const identifiers=metadata.map(row=>text(row.items)).filter(value=>/שמסתיים|המסתיים/.test(value)).flatMap(value=>[...value.matchAll(/(?:בספרות|ב)\s*[:]?\s*(\d{4})(?!\d)/g)].map(match=>match[1]));
 if(new Set(identifiers).size>1)throw Error('הדוח מכיל יותר מכרטיס אחד.');
 const summaries=[];for(const [index,page]of pages.entries())for(const row of lines(page.items.filter(i=>i.str?.trim())))if(/סהכחיובלתאריך/.test(norm(text(row.items))))summaries.push({...row,page:index+1});
 if(!summaries.length)throw Error('חסר סיכום חיוב בדוח ישראכרט. אין לקלוט דוח חלקי.');
 // Each billing table has its own printed ILS subtotal. Reconcile every section
 // before combining them; credit terms and informational fees are not extra bills.
 const entries=[],usedSummaries=new Set();let total=0;
 for(const [pageIndex,page]of pages.entries()){
  const footer=lines(page.items).map(row=>text(row.items)).find(value=>/^עמוד \d+ מתוך \d+$/.test(value));
  if(footer){const [,number,count]=footer.match(/^עמוד (\d+) מתוך (\d+)$/);if(+number!==pageIndex+1||+count!==pages.length)throw Error('חסרים עמודים בדוח ישראכרט או שסדר העמודים שגוי.');}
 }
 for(const [pageIndex,page]of pages.entries()){
  const items=page.items.filter(i=>i.str?.trim()),rows=lines(items),headers=rows.filter(row=>/שםבית(?:ה)?עסק/.test(norm(text(row.items)))&&row.items.some(i=>norm(i.str)==='תאריך'));
  if(!headers.length){
   const content=norm(text(items)),informational=/מסגרתהכרטיסותנאיהאשראי|הסכומיםושיעוריהריביותנכוניםלמועדהפקתדףריכוזחיובים|דיווחעמלותחצישנתי.*לידיעהבלבד.*לאלתשלום/.test(content);
   if(!informational||/שםבית(?:ה)?עסק|סהכחיובלתאריך|רכישותבחול|עסקותשחויבו/.test(content)||items.some(i=>right(i)>510&&datePattern.test(clean(i.str))))throw Error('לא זוהתה טבלת חיובים נתמכת בכל עמוד של דוח ישראכרט.');
   continue;
  }
  for(let h=0;h<headers.length;h++){
   const header=headers[h],next=headers[h+1],dates=header.items.filter(i=>norm(i.str)==='תאריך').sort((a,b)=>x(b)-x(a)),merchant=header.items.filter(i=>['שם','בית','עסק','העסק','שםביתעסק','שםביתהעסק'].includes(norm(i.str)));
   const heading=items.filter(i=>y(i)<=header.y+1&&y(i)>=header.y-17),charge=heading.filter(i=>['החיוב','סכוםהחיוב','סכוםחיוב'].includes(norm(i.str)));
   if(!dates.length||!merchant.length||charge.length!==1)throw Error('עמודות החיוב בדוח ישראכרט אינן מזוהות בבטחה.');
   const dateEdge=right(dates[0]),merchantRight=Math.max(...merchant.map(right))+3,merchantStart=Math.min(...merchant.map(x)),leftHeaders=header.items.filter(i=>right(i)<merchantStart-2),merchantLeft=Math.max(...leftHeaders.map(right));
   const domestic=header.items.some(i=>norm(i.str)==='כרטיס')&&heading.some(i=>norm(i.str)==='בשח');
   const headerBottom=(domestic?Math.min(...heading.map(y)):header.y)-2;
   const sectionSummaries=summaries.filter(row=>row.page===pageIndex+1&&row.y<headerBottom&&row.y>(next?.y??40));
   if(sectionSummaries.length!==1)throw Error('חסר סיכום יחיד לטבלת חיובים בדוח ישראכרט. אין לקלוט דוח חלקי.');
   const summary=sectionSummaries[0],summaryDate=summary.items.filter(i=>datePattern.test(clean(i.str))),summaryAmounts=summary.items.filter(i=>/^[+\-\d,.()]+$/.test(clean(i.str)));
   if(summaryDate.length!==1)throw Error('מועדי החיוב בדוח ישראכרט אינם תואמים.');
   const billedDate=parseDate(clean(summaryDate[0].str)),delay=(Date.parse(billedDate)-Date.parse(cycleDate))/86400000;
   // The cycle caption can precede the actual debit date (for example a weekend).
   // Use the printed debit date, requiring agreement across all billing sections.
   if(delay<0||delay>7||(dueDate&&dueDate!==billedDate))throw Error('מועדי החיוב בדוח ישראכרט אינם תואמים.');
   dueDate=billedDate;
   if(summaryAmounts.length!==1)throw Error('סיכום החיוב בדוח ישראכרט אינו חד־משמעי.');
   const subtotal=parseMoney(clean(summaryAmounts[0].str));if(subtotal===null)throw Error('חסר סכום סיכום בדוח ישראכרט.');
   // The printed subtotal and charge column must share the same right alignment.
   const amountHeader=heading.filter(i=>x(i)>=x(charge[0])-3&&x(i)<x(charge[0])+30),chargeEdge=Math.max(...amountHeader.map(right));
   if(Math.abs(right(summaryAmounts[0])-chargeEdge)>8)throw Error('עמודת החיוב אינה תואמת לסיכום השקלי בדוח ישראכרט.');
   const originalHeaders=header.items.filter(i=>norm(i.str)==='סכום'&&right(i)>chargeEdge+10&&right(i)<merchantLeft);
   if(domestic&&originalHeaders.length!==1)throw Error('סכום העסקה המקורי אינו מזוהה בבטחה בדוח ישראכרט.');
   const lower=summary.y,start=entries.length;
   const table=items.filter(i=>y(i)<headerBottom&&y(i)>lower+2),dateItems=table.filter(i=>Math.abs(right(i)-dateEdge)<7&&/^[\d/.]+$/.test(clean(i.str))),anchors=lines(dateItems);
   const usedCharges=new Set();
   for(let j=0;j<anchors.length;j++){
    const anchor=anchors[j],dateText=clean(text(anchor.items));if(!datePattern.test(dateText))throw Error('תאריך פעולה לא קריא בדוח ישראכרט.');const occurred=parseDate(dateText),upper=anchor.y+2,below=anchors[j+1]?.y??lower;
    const primary=table.filter(i=>Math.abs(y(i)-anchor.y)<1.5),billed=amountAt(primary,chargeEdge);usedCharges.add(billed.item);
    const body=table.filter(i=>y(i)<=upper&&y(i)>below+2),merchantItems=body.filter(i=>x(i)>merchantLeft+.5&&right(i)<merchantRight&&!/עמלה|הנחה/.test(i.str));
    // Notes begin on a separate full-width line; do not turn fees or discounts into merchants.
    const notesLine=lines(body).find(row=>/עמלה|הנחה|תשלום/.test(text(row.items))),name=text(merchantItems.filter(i=>domestic||!notesLine||y(i)>notesLine.y+1));
    if(!name||name.length>100)throw Error('שם בית העסק אינו קריא בדוח ישראכרט.');
    const original=domestic?[]:primary.filter(i=>right(i)<merchantLeft+1&&x(i)>merchantLeft-55),currency=text(original).match(/EUR|USD|GBP|ILS|€|\$|£|₪/i)?.[0],currencies={'€':'EUR','$':'USD','£':'GBP','₪':'ILS'},originalCurrency=currencies[currency]??currency?.toUpperCase();
    let foreignCents;if(originalCurrency&&originalCurrency!=='ILS'){const values=original.filter(i=>/^[+\-\d,.()]+$/.test(clean(i.str)));if(values.length!==1)throw Error('סכום המקור במטבע זר אינו ברור בדוח ישראכרט.');foreignCents=parseMoney(clean(values[0].str));}
    const originalCents=domestic?amountAt(primary,right(originalHeaders[0])).amount:billed.amount;
    const notes=text(body.filter(i=>domestic?right(i)<chargeEdge-12:notesLine&&y(i)<=notesLine.y+1));if(notes.length>2000)throw Error('הערות הדוח ארוכות מדי.');
    entries.push({date:occurred,merchant:name,amountCents:billed.amount,originalCents,notes,page:pageIndex+1,...(originalCurrency?{originalCurrency}:{}),...(foreignCents!==undefined?{foreignCents}:{})});
   }
   if(entries.length===start||entries.slice(start).reduce((sum,row)=>sum+row.amountCents,0)!==subtotal)throw Error('שורות החיוב אינן תואמות לסיכום טבלת ישראכרט. אין לקלוט דוח חלקי.');
   usedSummaries.add(summary);total+=subtotal;
   const chargeValues=table.filter(i=>Math.abs(right(i)-chargeEdge)<7&&/^[+\-\d,.()]+$/.test(clean(i.str)));if(chargeValues.some(i=>!usedCharges.has(i)))throw Error('נמצא סכום חיוב ללא פעולה מזוהה. דוח ישראכרט לא נקלט.');
  }
 }
 if(usedSummaries.size!==summaries.length)throw Error('נמצא סיכום ישראכרט ללא טבלת חיובים מזוהה. אין לקלוט דוח חלקי.');
 if(total<0)throw Error('דוח עם יתרת זכות כוללת דורש בדיקה נפרדת; לא נקלט סכום חיוב.');
 if(!entries.length||entries.length>Math.min(5000,LIMITS.rows)||entries.reduce((sum,row)=>sum+row.amountCents,0)!==total)throw Error('שורות החיוב אינן תואמות לסך דוח ישראכרט. אין לקלוט דוח חלקי.');
 return{issuer:'isracard',dueDate,amount:total/100,count:entries.length,last4:identifiers[0]??'',entries};
}
