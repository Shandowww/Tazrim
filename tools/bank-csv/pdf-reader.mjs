import {inspectIsracardPDF} from './isracard-pdf.mjs';
import {LIMITS,parseMoney,parseDate,guessMapping} from './parser.mjs';
const norm=s=>String(s??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[\s:״”"׳']/g,'');
const headerNames=['יתרה','זיכויים','חיובים','פרטיהפעולה','תאריךערך','תאריךתנועה'];
const money=s=>{const raw=String(s).replace(/[א-ת״”"׳'₪\s]/g,'');if(!/^[+\-\d,.()]+$/.test(raw))throw Error('סכום PDF לא קריא');const n=parseMoney(raw);if(n===null)throw Error('חסר סכום בדוח PDF');return n;};
const x=i=>i.transform[4],y=i=>i.transform[5],right=i=>x(i)+i.width;
function lines(items){const result=[];for(const i of [...items].sort((a,b)=>y(b)-y(a)||x(b)-x(a))){let line=result.find(l=>Math.abs(l.y-y(i))<1.5);if(!line){line={y:y(i),items:[]};result.push(line);}line.items.push(i);}return result.sort((a,b)=>b.y-a.y);}
function cellText(items){return lines(items).map(l=>l.items.sort((a,b)=>x(b)-x(a)).map(i=>i.str.trim()).join(' ')).join(' ').trim();}
export function inspectOneZeroPDF(pages){
 if(!pages.length||pages.length>20)throw Error('אפשר לקרוא דוח PDF עם 1–20 עמודים.');
 let columns=null,summary=null,declared=null,all=[],count=0,accountHint='';
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
 const page=pages[pageIndex],items=page.items.filter(i=>typeof i.str==='string'&&i.str.trim());count+=items.length;if(count>100000)throw Error('דוח PDF גדול מדי לאחר פתיחה.');
 if(items.some(i=>Math.abs(i.transform[1])>0.01||Math.abs(i.transform[2])>0.01))throw Error('PDF עם טקסט מסובב אינו נתמך.');
 const header=lines(items).find(l=>headerNames.every(name=>l.items.some(i=>norm(i.str)===name)));
 if(header){const headers=headerNames.map(name=>header.items.find(i=>norm(i.str)===name));if(headers.some((i,j)=>j&&x(i)<=x(headers[j-1])))throw Error('סדר העמודות בדוח PDF אינו נתמך.');columns=headers.map(i=>right(i)+3.6);}
 if(!columns)throw Error('לא נמצאה טבלת תנועות של וואן זירו. PDF סרוק אינו נתמך; בחר דוח מקורי מהבנק.');
 if(pageIndex===0){
 const top=items.filter(i=>!header||y(i)>header.y+3),text=top.map(i=>i.str).join(' ');if(!/ONE\s*ZERO/i.test(text)||!/שקליות/.test(text))throw Error('קורא PDF זה תומך בדוח התנועות המלא של וואן זירו בלבד.');
 const accountText=lines(top).map(l=>cellText(l.items)).join(' '),accountMatches=[...accountText.matchAll(/מספר חשבון[:\s]*(\d{3,16})(?!\d)/g)].map(m=>m[1]);if(new Set(accountMatches).size===1)accountHint=accountMatches[0];
 const periodLine=lines(top).find(l=>/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(cellText(l.items)));
 if(!periodLine)throw Error('לא זוהה טווח תקופה בכותרת דוח PDF.');const dates=cellText(periodLine.items).match(/\d{2}\/\d{2}\/\d{4}/g).map(d=>parseDate(d)).sort();declared={from:dates[0],to:dates.at(-1)};
 const getSummary=label=>{const labelItem=top.find(i=>norm(i.str)===norm(label));if(!labelItem)throw Error('חסר סיכום כספי בדוח PDF');const candidates=top.filter(i=>Math.abs(y(i)-y(labelItem))<2&&right(i)<x(labelItem)&&/\d/.test(i.str));if(candidates.length!==1)throw Error('סיכום כספי לא חד־משמעי בדוח PDF');return money(candidates[0].str);};
 summary={openingCents:getSummary('יתרה קודמת:'),closingCents:getSummary('יתרה חדשה:'),debitCents:getSummary('סך כל החיובים:'),creditCents:getSummary('סך כל הזיכויים:')};
 }
 const dateItems=items.filter(i=>y(i)<(header?.y??page.height-30)&&y(i)>55&&x(i)>columns[4]&&x(i)<columns[5]&&/\d/.test(i.str)),dateLines=lines(dateItems),firstY=dateLines[0]?.y,nextY=dateLines[1]?.y,lastY=dateLines.at(-1)?.y,previousY=dateLines.at(-2)?.y,bottom=lastY===undefined?55:lastY-(previousY===undefined?20:(previousY-lastY)/2);
 // Continuation pages need not repeat column headings. Bound their table by
 // dated row centres, excluding page chrome and signature text from column checks.
 const top=header?.y??(firstY===undefined?page.height-30:firstY+(nextY===undefined?20:(firstY-nextY)/2));
 const table=items.filter(i=>y(i)<top&&y(i)>bottom),byColumn=Array.from({length:6},()=>[]);
 for(const i of table){const c=columns.findIndex(end=>x(i)<end-1);if(c>=0){if(right(i)>columns[c]+4)throw Error('תא PDF חוצה עמודות; אין לקלוט דוח לא ברור.');byColumn[c].push(i);}}
 const anchors=lines(byColumn[5]).filter(l=>/\d/.test(cellText(l.items))).map(l=>{const text=cellText(l.items);try{return {y:l.y,date:parseDate(text),raw:text};}catch{throw Error('תאריך תנועה לא קריא בטבלת PDF.');}});
 if(!anchors.length)throw Error('עמוד PDF ללא תנועות קריאות; לא ניתן לוודא שהדוח מלא.');
 for(let j=0;j<anchors.length;j++){
 const a=anchors[j],upper=j?(anchors[j-1].y+a.y)/2:top,lower=j+1<anchors.length?(a.y+anchors[j+1].y)/2:bottom;
 const cells=byColumn.map(col=>cellText(col.filter(i=>y(i)<upper&&y(i)>lower)));const [balance,credit,debit,description,valueDate]=cells;
 if(!description||description.length>LIMITS.cell)throw Error('פרטי פעולה חסרים או גדולים מדי בדוח PDF');
 const r={date:a.date,valueDate:parseDate(valueDate),description,balance:money(balance),debit:money(debit),credit:money(credit),page:pageIndex+1};
 if(r.debit&&r.credit)throw Error('גם חיוב וגם זיכוי באותה שורת PDF');all.push(r);
 }
 }
 if(all.length>LIMITS.rows)throw Error('דוח PDF כולל יותר מדי תנועות.');
 const debits=all.reduce((n,r)=>n+r.debit,0),credits=all.reduce((n,r)=>n+r.credit,0);
 if(debits!==summary.debitCents||credits!==summary.creditCents||summary.openingCents+credits-debits!==summary.closingCents)throw Error('סכומי התנועות אינם תואמים לסיכומי דוח ה־PDF. הקליטה נעצרה; שום נתון לא נשמר.');
 let balance=summary.openingCents;for(const r of all){balance+=r.credit-r.debit;if(balance!==r.balance)throw Error('יתרת שורה אינה תואמת לתנועות שקדמו לה. דוח PDF זה דורש בירור לפני קליטה.');}
 if(balance!==summary.closingCents)throw Error('יתרת הסיום אינה תואמת לדוח PDF.');
 const dates=all.map(r=>r.date).sort(),from=declared.from<dates[0]?declared.from:dates[0],to=declared.to>dates.at(-1)?declared.to:dates.at(-1),periodMismatch=dates[0]<declared.from||dates.at(-1)>declared.to;
 const headers=['תאריך תנועה','תאריך ערך','פרטי הפעולה','חיובים','זיכויים','יתרה'];
 return {format:'pdf',rows:[{line:1,cells:headers},...all.map((r,i)=>({line:i+2,cells:[r.date,r.valueDate,r.description,(r.debit/100).toFixed(2),(r.credit/100).toFixed(2),(r.balance/100).toFixed(2)],page:r.page}))],headerIndex:0,mapping:guessMapping(headers),pdfReconciliation:{...summary,...(accountHint?{accountHint}:{}),count:all.length,verified:true,declared,from,to,periodMismatch,reversals:all.filter(r=>r.debit<0||r.credit<0).length}};
}
// Hapoalim's original five-column export is newest first. It has no printed
// totals: reconcile adjacent running balances, then emit chronological rows.
// Do not copy account names/numbers or document metadata into the inspection.
export function inspectHapoalimPDF(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>20)throw Error('אפשר לקרוא דוח PDF עם 1–20 עמודים.');
 const names=['תאריך','פעולה','חובה','זכות','יתרהבשח'],all=[];let declared,accountSignature,count=0;
 const fail=()=>{throw Error('מבנה דוח PDF של הפועלים אינו תואם או שחסרים נתונים. נסו לייצא את תנועות החשבון כ־Excel.');};
 for(const [index,page]of pages.entries()){
  const items=page.items.filter(i=>typeof i.str==='string'&&i.str.trim());count+=items.length;
  if(count>100000||items.some(i=>Math.abs(i.transform[1])>.01||Math.abs(i.transform[2])>.01))fail();
  const rows=lines(items),headers=rows.filter(r=>names.every(n=>r.items.filter(i=>norm(i.str)===n).length===1));if(headers.length!==1)fail();
  const header=headers[0],columns=names.map(n=>header.items.find(i=>norm(i.str)===n)),edges=columns.map(right);
  if(edges.some((e,i)=>i&&e>=edges[i-1])||Math.abs(edges[0]-576)>10||Math.abs(edges[4]-146)>10)fail();
  // Bank code 12 below the bank heading distinguishes the export from card bills.
  const bank=items.find(i=>norm(i.str)==='בנק');if(!bank||!items.some(i=>norm(i.str)==='12'&&y(i)<y(bank)&&y(i)>y(bank)-20&&Math.abs(right(i)-right(bank))<5))fail();
  const account=items.find(i=>norm(i.str)==='חשבון'),accountValues=account?items.filter(i=>y(i)<y(account)&&y(i)>y(account)-20&&Math.abs(right(i)-right(account))<5):[];
  if(accountValues.length!==1||!/^\d+$/.test(norm(accountValues[0].str)))fail();
  const signature=norm(accountValues[0].str);if(accountSignature&&signature!==accountSignature)fail();accountSignature=signature;
  const footer=items.filter(i=>y(i)<35),number=footer.filter(i=>x(i)>555&&/^\d+$/.test(i.str)),total=footer.filter(i=>x(i)>520&&x(i)<535&&/^\d+$/.test(i.str));
  if(!footer.some(i=>norm(i.str)==='מתוך')||number.length!==1||total.length!==1||+number[0].str!==index+1||+total[0].str!==pages.length)fail();
  if(index===0){
   const title=items.find(i=>norm(i.str)==='תנועותבחשבון');if(!title||y(title)<=header.y)fail();
   const dates=items.filter(i=>y(i)>header.y&&y(i)<y(title)&&/^\d{2}\/\d{2}\/\d{4}$/.test(i.str)).map(i=>parseDate(i.str)).sort();if(dates.length!==2)fail();declared={from:dates[0],to:dates[1]};
  }
  const table=items.filter(i=>y(i)<header.y-3&&y(i)>40&&x(i)>40),byColumn=Array.from({length:5},()=>[]);
  for(const item of table){const c=edges.findIndex(e=>Math.abs(right(item)-e)<7);if(c<0||(c<4&&x(item)<=edges[c+1]+7))fail();byColumn[c].push(item);}
  const anchors=byColumn[0].sort((a,b)=>y(b)-y(a));if(!anchors.length)fail();
  const used=new Set();
  for(const anchor of anchors){
   const cells=byColumn.map(col=>col.filter(i=>Math.abs(y(i)-y(anchor))<1.5));if(cells.some(c=>c.length>1)||cells[0].length!==1||cells[1].length!==1||cells[4].length!==1||cells[2].length+cells[3].length!==1)fail();
   cells.flat().forEach(i=>{if(used.has(i))fail();used.add(i);});
   const date=parseDate(anchor.str),description=cells[1][0].str.trim(),debit=cells[2].length?money(cells[2][0].str):0,credit=cells[3].length?money(cells[3][0].str):0,balance=money(cells[4][0].str);
   if(date<declared.from||date>declared.to||!description||description.length>LIMITS.cell||credit<0||(!debit&&!credit))fail();
   all.push({date,description,debit,credit,balance,page:index+1});
  }
  if(used.size!==table.length)fail();
 }
 if(all.length<2||all.length>LIMITS.rows)fail();
 for(let i=0;i<all.length-1;i++){const r=all[i],older=all[i+1];if(r.date<older.date||r.balance!==older.balance+r.credit-r.debit)throw Error('יתרות התנועות בדוח הפועלים אינן תואמות. הקליטה נעצרה; נסו יצוא Excel מלא מהבנק.');}
 const chronological=[...all].reverse(),oldest=chronological[0],headers=['תאריך','הפעולה','חובה','זכות','יתרה'];
 return {format:'pdf',rows:[{line:1,cells:headers},...chronological.map((r,i)=>({line:i+2,page:r.page,cells:[r.date,r.description,r.debit?(r.debit/100).toFixed(2):'',r.credit?(r.credit/100).toFixed(2):'',(r.balance/100).toFixed(2)]}))],headerIndex:0,mapping:guessMapping(headers),pdfReconciliation:{provider:'hapoalim',method:'running-balances',verified:true,count:all.length,declared,...declared,periodMismatch:false,openingCents:oldest.balance-oldest.credit+oldest.debit,closingCents:all[0].balance,debitCents:all.reduce((s,r)=>s+r.debit,0),creditCents:all.reduce((s,r)=>s+r.credit,0),reversals:all.filter(r=>r.debit<0).length}};
}

export async function readPDFPages(bytes){
 if(bytes.byteLength>LIMITS.bytes)throw Error('אפשר לקרוא PDF עד 5MB.');if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('זה אינו קובץ PDF תקין.');
 const pdfjs=await import('./vendor/pdfjs/pdf.mjs');globalThis.pdfjsWorker??=await import('./vendor/pdfjs/pdf.worker.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,useWasm:false,stopAtErrors:true,verbosity:0});
 try{const doc=await task.promise;if(doc.numPages>20)throw Error('אפשר לקרוא PDF עד 20 עמודים.');const pages=[];let total=0;
 for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),text=await page.getTextContent(),viewport=page.getViewport({scale:1});total+=text.items.length;if(total>100000)throw Error('דוח PDF גדול מדי לאחר פתיחה.');pages.push({items:text.items,width:viewport.width,height:viewport.height});page.cleanup();}
 return pages;
 }catch(e){if(e.name==='PasswordException')throw Error('PDF מוגן בסיסמה אינו נתמך.');throw e;}finally{await task.destroy();}
}

export async function readOneZeroPDF(bytes){return inspectOneZeroPDF(await readPDFPages(bytes));}
export async function readReportPDF(bytes){const pages=await readPDFPages(bytes);if(pages.some(page=>lines(page.items).some(row=>['תאריך','פעולה','חובה','זכות','יתרהבשח'].every(name=>row.items.some(item=>norm(item.str)===name)))))return{inspection:inspectHapoalimPDF(pages)};if(pages.some(page=>lines(page.items).some(row=>headerNames.every(name=>row.items.some(item=>norm(item.str)===name)))))return{inspection:inspectOneZeroPDF(pages)};const report=inspectIsracardPDF(pages);if(report)return{intake:{kind:'card',provider:'isracard',identity:report.last4?'isracard:'+report.last4:'',report}};throw Error('מבנה דוח PDF לא נתמך. בחרו דוח תנועות מקורי של הפועלים או וואן זירו, דוח ישראכרט, או יצוא Excel מהבנק.');}
