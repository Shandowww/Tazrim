import {parseDate,parseMoney,LIMITS} from './parser.mjs';
const clean=v=>String(v??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
const x=i=>i.transform[4],y=i=>i.transform[5],right=i=>x(i)+i.width;
const fail=()=>{throw Error('מבנה דוח כאל אינו נתמך או שסכומי הדוח אינם תואמים. הורידו דוח חיוב חודשי מלא כ־Excel מכאל ונסו שוב. אין קליטה חלקית.');};
function lines(items){const rows=[];for(const i of [...items].sort((a,b)=>y(b)-y(a))){let row=rows.find(r=>Math.abs(r.y-y(i))<.8);if(!row){row={y:y(i),items:[]};rows.push(row);}row.items.push(i);}return rows.sort((a,b)=>b.y-a.y);}
// Cal emits individual Hebrew and Latin glyphs. Reassemble each directional run
// before ordering the runs, so dates, card suffixes and English merchants survive RTL.
function lineText(items){const runs=[];for(const i of [...items].sort((a,b)=>x(b)-x(a))){const rtl=i.dir==='rtl'||/[א-ת]/.test(i.str),last=runs.at(-1),gap=last?last.left-right(i):0;if(last&&last.rtl===rtl&&gap<12){last.items.push(i);last.left=x(i);}else runs.push({rtl,left:x(i),items:[i]});}return runs.map(r=>r.items.sort((a,b)=>r.rtl?x(b)-x(a):x(a)-x(b)).map((i,n,a)=>(n&&(r.rtl?x(a[n-1])-right(i):x(i)-right(a[n-1]))>=1.8?' ':'')+clean(i.str)).join('')).join(' ');}
const text=items=>lines(items).map(r=>lineText(r.items)).join(' ');
const compact=items=>text(items).replace(/\s/g,'');
const bounds=[[500,545],[420,500],[380,420],[280,380],[250,280],[190,250],[130,190]];
const cells=items=>bounds.map(([lo,hi])=>items.filter(i=>x(i)>=lo-.5&&right(i)<=hi+.5));
function money(items,requiredILS=false){const value=text(items),match=/^(₪|EU|USD|EUR|GBP|\$|€|£)\s*([+\-\d,.()]+)$/.exec(value);if(!match||requiredILS&&match[1]!=='₪')fail();const cents=parseMoney(match[2]);if(cents===null)fail();return{cents,currency:({'₪':'ILS',EU:'EUR','$':'USD','€':'EUR','£':'GBP'})[match[1]]??match[1]};}
export function inspectCalPDF(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>20)fail();
 const all=pages.flatMap(p=>p.items.filter(i=>clean(i.str)));
 if(!all.some(i=>/cal-online\.co\.il/i.test(i.str)))return null;
 if(all.length>100000||all.some(i=>x(i)>=130&&y(i)>195&&(Math.abs(i.transform[1])>.01||Math.abs(i.transform[2])>.01)))fail();
 const title=all.filter(i=>/דף חיוב חודשי/.test(i.str));if(title.length!==1)fail();
 const dateMatch=/דף חיוב חודשי ל-(\d{2}\/\d{2}\/\d{2}(?:\d{2})?)$/.exec(clean(title[0].str));if(!dateMatch)fail();const dueDate=parseDate(dateMatch[1]);
 const ids=new Set(),entries=[];let declaredTotal=null,summaries=0;
 for(const [index,page]of pages.entries()){
  // This reader deliberately accepts the verified digital monthly template only.
  if(Math.abs(page.width-555.59)>2||Math.abs(page.height-833.39)>2)fail();
  const items=page.items.filter(i=>clean(i.str)),rows=lines(items),pageNumber=compact(items.filter(i=>y(i)>810&&x(i)>460));if(pageNumber!==`עמוד${index+1}מתוך${pages.length}`)fail();
  const identity=rows.filter(r=>/המסתייםב-?\d{4}/.test(compact(r.items))).map(r=>compact(r.items));
  for(const row of identity){const m=/המסתייםב-?(\d{4})(?!\d)/.exec(row);if(!m)fail();ids.add(m[1]);}
  if(!identity.length||ids.size!==1)fail();
  const headers=rows.filter(r=>{const c=cells(r.items);return compact(c[0])==='תאריך'&&compact(c[1])==='שםביתהעסק'&&compact(c[2])==='ענף'&&compact(c[3])==='פירוט'&&compact(c[4])==='כרטיס'&&compact(c[5])==='סכום'&&compact(c[6])==='סכום';});if(headers.length!==1)fail();
  const header=headers[0],second=rows.find(r=>r.y<header.y&&r.y>header.y-9),sub=second&&cells(second.items);if(!sub||compact(sub[0])!=='העסקה'||compact(sub[4])!=='הוצג'||compact(sub[5])!=='העסקה'||compact(sub[6])!=='חיוב')fail();
  const summaryRows=rows.filter(r=>r.items.some(i=>/סה"כ לתאריך/.test(i.str)));
  if(index<pages.length-1&&summaryRows.length||index===pages.length-1&&summaryRows.length!==1)fail();
  const summary=summaryRows[0];if(summary){const label=summary.items.find(i=>/סה"כ לתאריך/.test(i.str)),m=/^סה"כ לתאריך (\d{2}\/\d{2}\/\d{2}(?:\d{2})?)$/.exec(clean(label.str));if(!m||parseDate(m[1])!==dueDate)fail();declaredTotal=money(cells(summary.items)[6],true).cents;summaries++;}
  const bottom=summary?.y??195,table=items.filter(i=>y(i)<second.y-2&&y(i)>bottom+2&&x(i)>=130),tableRows=lines(table),anchors=tableRows.filter(r=>cells(r.items)[0].length);
  if(!anchors.length)fail();const used=new Set();
  for(const [j,anchor]of anchors.entries()){
   const c=cells(anchor.items),dateString=text(c[0]);if(!/^\d{2}\/\d{2}\/\d{4}$/.test(dateString))fail();const date=parseDate(dateString),billed=money(c[6],true),original=money(c[5]);
   const lower=anchors[j+1]?.y??bottom,body=table.filter(i=>y(i)<=anchor.y+.8&&y(i)>lower+2),groups=cells(body);
   if(groups.flat().length!==body.length)fail();body.forEach(i=>{if(used.has(i))fail();used.add(i);});
   if(groups[0].length!==c[0].length||groups[5].length!==c[5].length||groups[6].length!==c[6].length)fail();
   const merchant=text(groups[1]),notes=text(groups[3]);if(!merchant||merchant.length>100||notes.length>2000)fail();
   entries.push({date,merchant,amountCents:billed.cents,originalCents:original.currency==='ILS'?original.cents:billed.cents,notes,page:index+1,...(original.currency!=='ILS'?{originalCurrency:original.currency,foreignCents:original.cents}:{})});
  }
  if(used.size!==table.length)fail();
 }
 if(ids.size!==1||summaries!==1||declaredTotal<0||!entries.length||entries.length>Math.min(5000,LIMITS.rows)||entries.reduce((s,r)=>s+r.amountCents,0)!==declaredTotal)fail();
 return{issuer:'cal',dueDate,amount:declaredTotal/100,count:entries.length,last4:[...ids][0],entries};
}

/** Only the card-message section is evidence for Cal notices: exclude ads,
 * transaction notes, credit illustrations, addresses and page footers. */
export function calPDFNoticePages(pages){
 if(!pages.some(p=>p.items?.some(i=>/cal-online\.co\.il/i.test(i.str))))return null;
 return pages.map((page,index)=>{
  if(Math.abs(page.width-555.59)>2||Math.abs(page.height-833.39)>2)throw Error('מבנה הודעות דוח כאל אינו נתמך. יש לבדוק את המקור.');
  const rows=lines(page.items.filter(i=>clean(i.str)&&x(i)>=130&&y(i)>195)),headings=rows.filter(r=>/^הודעהלכרטיסהמסתייםב/.test(compact(r.items)));
  if(headings.length>1)throw Error('מדור ההודעות בדוח כאל אינו חד־משמעי.');
  if(!headings.length)return{page:index+1,text:'כאל'};
  const blocks=[];for(const row of rows.filter(r=>r.y<headings[0].y-2)){
   const value=lineText(row.items);if(/^•/.test(value))blocks.push(value);else if(blocks.length)blocks[blocks.length-1]+=' '+value;
  }
  return{page:index+1,text:'כאל\nהודעות\n'+blocks.join('\n')};
 });
}
