import {inspectDuplicates,acceptReviewed,readLedger} from './dedupe.mjs';
import {destinations,classify,monthlyProposal,eligible,compatible} from './classifier.mjs';
import {decodeCSV,inspectCSV,guessMapping,normalizeRows,LIMITS} from './parser.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>`<bdi>${new Intl.NumberFormat('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100)} ₪</bdi>`;
const labels={date:'תאריך',description:'הפעולה',details:'פרטים',reference:'אסמכתא',debit:'חובה',credit:'זכות',balance:'יתרה בש״ח',valueDate:'תאריך ערך',beneficiary:'לטובת',purpose:'עבור',amount:'סכום',currency:'מטבע',direction:'סוג חובה / זכות'};
let bytes=null,fileName='',inspection=null,result=null,mapping={},page=0,reading=false,sequence=0;
const registryScope='tal-personal-current';
let registry={format:'bank-import-registry',version:1,scope:registryScope,entries:[]};
let sourceIsDemo=false,rules=[],overrides={},classification=[],classPage=0;
$('rule-destination').innerHTML=Object.entries(destinations).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('');
function showSource(){
 $('source-banner').hidden=!bytes;if(!bytes)return;
 $('source-banner').innerHTML=sourceIsDemo?'<strong>נתוני דוגמה מומצאים בלבד</strong><p>התוצאות כאן הגיעו מדוח ההדגמה. כדי לבדוק את דוח הבנק שלך, בחר את קובץ ה־XLSX מהמכשיר.</p>':`<strong>מקור הנתונים: <bdi>${esc(fileName)}</bdi></strong><p>הפענוח משתמש בקובץ שבחרת. אין ערבוב עם דוח ההדגמה.</p>`;
 $('source-detail').textContent=`מקור: ${fileName}${inspection?.sheetName?' · גיליון: '+inspection.sheetName:''} · ${sourceIsDemo?'דוגמה מומצאת':'קובץ מהמכשיר'} · טווח הסיכום: ${$('from').value} עד ${$('to').value}`;
}
let xlsxWorker=null,requestId=0;
function xlsxRequest(worker,message){return new Promise((resolve,reject)=>{
 const id=++requestId,timeout=setTimeout(()=>{cleanup();worker.terminate();reject(Error('קריאת Excel ארכה מדי. נסה דוח קטן יותר.'));},20000);
 const cleanup=()=>{clearTimeout(timeout);worker.removeEventListener('message',receive);worker.removeEventListener('error',failed);};
 const receive=event=>{if(event.data.id!==id)return;cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data);};
 const failed=()=>{cleanup();reject(Error('לא ניתן לטעון את קורא Excel המקומי. רענן את ממשק הבדיקה ונסה שוב.'));};
 worker.addEventListener('message',receive);worker.addEventListener('error',failed);worker.postMessage({...message,id});
});}
function prepareInspection(next,info){
 inspection=next;mapping={...next.mapping};overrides={};classPage=0;invalidate();
 $('header').innerHTML=next.rows.slice(0,35).map((r,i)=>`<option value="${i}" ${i===next.headerIndex?'selected':''}>שורה ${r.line} · ${esc(r.cells.join(' · ').slice(0,100))}</option>`).join('');
 $('mode').value=mapping.debit>=0||mapping.credit>=0?'split':'signed';$('invert').checked=false;mappingView();$('controls').hidden=false;$('clear').disabled=false;
 $('file-info').hidden=false;$('file-info').textContent=info;$('controls').open=false;showSource();analyze();
}
function setTheme(theme){document.documentElement.dataset.theme=theme;try{localStorage.setItem('bank-csv-lab-theme',theme);}catch{$('status').textContent='בחירת המראה הוחלה; הדפדפן אינו מאפשר לזכור אותה.';}}
try{const choice=localStorage.getItem('bank-csv-lab-theme');if(['system','light','dark'].includes(choice)){$('theme').value=choice;document.documentElement.dataset.theme=choice;}}catch{}
$('theme').addEventListener('change',()=>setTheme($('theme').value));
function error(e){$('error').textContent=e.message;$('error').hidden=false;}
function clearError(){$('error').hidden=true;$('error').textContent='';}
function invalidate(){result=null;overrides={};$('results').hidden=true;clearError();}
function reset(){sequence++;xlsxWorker?.terminate();xlsxWorker=null;bytes=null;inspection=null;result=null;fileName='';sourceIsDemo=false;rules=[];overrides={};classPage=0;$('rules').innerHTML='';$('file').value='';$('sheet-label').hidden=true;$('sheet').innerHTML='';$('controls').hidden=true;$('results').hidden=true;$('clear').disabled=true;$('example').disabled=false;$('file-info').hidden=true;$('source-banner').hidden=true;$('status').textContent='הדוח נוקה מהבדיקה.';clearError();}
function controlsBusy(value){reading=value;for(const id of ['file','example','sheet','clear'])$(id).disabled=value||(id==='clear'&&!bytes)||(id==='example'&&!!bytes);}
function mappingView(){
 const headers=inspection.rows[Number($('header').value)].cells,mode=$('mode').value;
 $('mapping').innerHTML=Object.entries(labels).filter(([field])=>mode==='split'?!['amount','direction'].includes(field):!['debit','credit'].includes(field)).map(([field,label])=>`<label>${label}<select data-field="${field}"><option value="-1">לא מופיע בקובץ</option>${headers.map((h,i)=>`<option value="${i}" ${mapping[field]===i?'selected':''}>${i+1}. ${esc(h||'ללא כותרת')}</option>`).join('')}</select></label>`).join('');
 $('invert-label').hidden=mode!=='signed';
}
function decodeAndInspect(){
 invalidate();if(!bytes)return;
 try{
  const decoded=decodeCSV(bytes,$('encoding').value),next=inspectCSV(decoded.text,$('delimiter').value==='tab'?'\t':$('delimiter').value),sep=next.delimiter==='\t'?'טאב':next.delimiter;
  prepareInspection(next,`${fileName} · ${decoded.encoding} · מפריד: ${sep} · ${next.rows.length} שורות לא ריקות`);
 }catch(e){$('controls').hidden=true;$('clear').disabled=false;error(e);$('status').textContent='הקובץ לא פוענח. אפשר לבחור קובץ אחר או לשנות קידוד ומפריד.';/* Keep retry controls available on decoding errors. */$('controls').hidden=false;$('controls').open=true;$('mapping').innerHTML='';$('header').innerHTML='';inspection=null;}
}
function analyze(){
 if(!inspection){if(!xlsxWorker)decodeAndInspect();return;}invalidate();
 try{
  result=normalizeRows(inspection,{headerIndex:Number($('header').value),mapping,mode:$('mode').value,decimal:$('decimal').value,dateFormat:$('dateFormat').value,defaultCurrency:$('currency').value,invertSign:$('invert').checked,period:{from:$('from').value,to:$('to').value}});page=0;
  const dedup=inspectDuplicates(result.records,registry,registryScope);result.records=dedup.records;result.duplicates={duplicate:dedup.duplicate,conflict:dedup.conflict,missingReference:dedup.missingReference};
  const s=result.summary;
  showSource();$('summary').innerHTML=[['שורות שנכללו בסיכום',s.count],['סך זכות · מהשורות שנכללו',money(s.creditCents)],['סך חובה · מהשורות שנכללו',money(s.debitCents)],['זכות פחות חובה',money(s.netCents)]].map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('notes').innerHTML=`<p>${result.records.length} שורות לאחר הכותרת · ${s.invalid} לא פוענחו ואינן בסיכום · ${s.warnings} עם הערות לבדיקה · ${s.outsidePeriod} מחוץ לתקופה.</p><p>${result.skippedPreamble?`${result.skippedPreamble} שורות פתיחה לפני הכותרת לא נכללו. `:''}כפילויות אפשריות מסומנות ונכללות בסכומים; אין מחיקה אוטומטית.</p><p>${s.balanceCandidate?`יתרה בתאריך האחרון שנמצא (${esc(s.balanceCandidate.date)}): ${money(s.balanceCandidate.balanceCents)}. יש לוודא שזו אכן יתרת הסגירה בדוח.`:s.balanceAmbiguous?'נמצאו כמה יתרות שונות בתאריך האחרון. לא נבחרה יתרת סגירה; צריך לבדוק את סדר התנועות בדוח.':'לא זוהתה יתרת סגירה יחידה מהשורות התקינות.'}</p>`;
  if(inspection.notices?.length)$('notes').innerHTML+=`<p>${esc(inspection.notices.join(' · '))}</p>`;
  if(inspection.format==='xlsx')$('notes').innerHTML+='<p>בתצוגת שורות המקור, תאריך עשוי להופיע כמספר הסידורי ש־Excel שומר (למשל 46307). הסר את הסימון ״שורות המקור״ כדי לראות את התאריך שפוענח ואת הסכומים בפורמט קריא.</p>';
  if(mapping.currency<0)$('notes').innerHTML+=`<p>בקובץ לא מופתה עמודת מטבע. המטבע לסיכום נבחר בהגדרות הפענוח: ${esc($('currency').selectedOptions[0].textContent)}.</p>`;
  $('months').innerHTML=s.months.length?s.months.map(m=>`<tr><td><bdi>${m.month}</bdi></td><td>${m.count}</td><td>${money(m.creditCents)}</td><td>${money(m.debitCents)}</td><td>${money(m.creditCents-m.debitCents)}</td></tr>`).join(''):'<tr><td colspan="5">אין תנועות תקינות בשקלים לסיכום.</td></tr>';
  $('results').hidden=false;renderRecords();renderClassification();$('status').textContent=`${fileName} · הפענוח הושלם לבדיקה. לא נשמרו נתונים בתקציב.`;
 }catch(e){error(e);$('controls').open=true;}
}
function renderRecords(){
 if(!result)return;const query=$('search').value.trim().toLowerCase(),filter=$('filter').value,raw=$('raw').checked;
 const rows=result.records.filter(r=>(!query||(r.description+' '+r.details+' '+r.reference+' '+r.beneficiary+' '+r.purpose).toLowerCase().includes(query))&&(filter==='all'||filter==='invalid'&&!r.valid||filter==='issues'&&(r.issues.length||r.warnings.length)));
 const pages=Math.max(1,Math.ceil(rows.length/100));page=Math.min(page,pages-1);$('row-count').textContent=`${rows.length} שורות בתצוגה · עד 100 בכל עמוד`;
 const headers=raw?['שורה','מצב',...result.headers.map((h,i)=>h||`עמודה ${i+1}`)]:['שורה','תאריך','הפעולה','פרטים','אסמכתא','חובה','זכות','יתרה בש״ח','תאריך ערך','לטובת','עבור','סכום חתום','מטבע','בדיקה'];
 $('records').innerHTML=`<thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(page*100,page*100+100).map(r=>`<tr class="${r.valid?'':'invalid'}">${raw?`<td>${r.line}</td><td>${r.valid?'פוענח':'דורש בדיקה'}</td>${r.raw.map(cell=>`<td class="description">${esc(cell)}</td>`).join('')}`:`<td>${r.line}</td><td><bdi>${esc(r.date??'—')}</bdi></td><td class="description">${esc(r.description)}</td><td class="description">${esc(r.details)}</td><td><bdi>${esc(r.reference)}</bdi></td><td><bdi>${r.debitCents===null?'—':(r.debitCents/100).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}</bdi></td><td><bdi>${r.creditCents===null?'—':(r.creditCents/100).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}</bdi></td><td><bdi>${r.balanceCents===null?'—':(r.balanceCents/100).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}</bdi></td><td><bdi>${esc(r.valueDate??'—')}</bdi></td><td class="description">${esc(r.beneficiary)}</td><td class="description">${esc(r.purpose)}</td><td><bdi>${r.amountCents===null?'—':(r.amountCents/100).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}</bdi></td><td><bdi>${esc(r.currency)}</bdi></td><td class="notes">${r.issues.length||r.warnings.length?esc([...r.issues,...r.warnings].join(' · ')):'<span class="badge">פוענח</span>'}</td>`}</tr>`).join('')||`<tr><td colspan="${headers.length}">אין שורות שמתאימות לסינון.</td></tr>`}</tbody>`;
 $('previous').disabled=page===0;$('next').disabled=page>=pages-1;$('page').textContent=`${page+1} מתוך ${pages}`;
}
async function loadFile(file,{example=false}={}){
 if(!file)return;if(example&&bytes){error(Error('נקה את הדוח הטעון לפני פתיחת דוגמה.'));return;}
 const token=++sequence;controlsBusy(true);clearError();$('results').hidden=true;$('status').textContent=`קורא את ${file.name}…`;
 let candidate=null;
 try{
  if(file.size>LIMITS.bytes)throw Error('הקובץ גדול מדי. אפשר לבדוק קובץ עד 5MB.');
  if(/\.(xlsm|xlsb)$/i.test(file.name))throw Error('בחר קובץ CSV, XLSX או XLS ללא מאקרו.');
  const loaded=new Uint8Array(await file.arrayBuffer());if(token!==sequence)return;
  if(/\.xlsx?$/i.test(file.name)){
   candidate=new Worker('./xlsx-worker.js');const data=await xlsxRequest(candidate,{action:'load',bytes:loaded.buffer,format:/\.xls$/i.test(file.name)?'xls':'xlsx'});
   if(token!==sequence){candidate.terminate();return;}
   xlsxWorker?.terminate();xlsxWorker=candidate;candidate=null;bytes=loaded;fileName=file.name;sourceIsDemo=example;showSource();
   $('sheet-label').hidden=false;$('sheet').innerHTML=data.sheets.map(s=>`<option value="${esc(s.name)}" ${s.name===data.selected?'selected':''}>${esc(s.name)}${s.hidden?' · מוסתר':''}${s.empty?' · ריק':''}</option>`).join('');
   $('encoding-label').hidden=true;$('delimiter-label').hidden=true;
   if(data.inspection)prepareInspection(data.inspection,`${fileName} · ${data.inspection.format.toUpperCase()} · ${data.selected} · ${data.inspection.rows.length} שורות לא ריקות`);
   else{inspection=null;invalidate();$('controls').hidden=true;$('file-info').hidden=true;error(Error(data.notice));$('status').textContent='הקובץ נפתח. בחר גיליון עם תנועות.';}
  }else{
   xlsxWorker?.terminate();xlsxWorker=null;bytes=loaded;fileName=file.name;sourceIsDemo=example;showSource();$('sheet-label').hidden=true;$('encoding-label').hidden=false;$('delimiter-label').hidden=false;$('encoding').value='auto';$('delimiter').value='auto';decodeAndInspect();
  }
 }
 catch(e){if(token===sequence){error(e);$('status').textContent=`${file.name} לא נטען. תוצאותיו אינן מוצגות.${bytes?' הקובץ הקודם עדיין בזיכרון: '+fileName+'.':''}`;}}
 finally{candidate?.terminate();if(token===sequence)controlsBusy(false);}
}
$('sheet').addEventListener('change',async()=>{
 if(!xlsxWorker)return;const token=++sequence;invalidate();inspection=null;$('controls').hidden=true;$('file-info').hidden=true;controlsBusy(true);$('status').textContent='קורא את הגיליון…';
 try{const data=await xlsxRequest(xlsxWorker,{action:'sheet',name:$('sheet').value});if(token!==sequence)return;prepareInspection(data.inspection,`${fileName} · ${data.inspection.format.toUpperCase()} · ${$('sheet').value} · ${data.inspection.rows.length} שורות לא ריקות`);}
 catch(e){error(e);$('status').textContent='הגיליון לא פוענח. בחר גיליון אחר.';}
 finally{if(token===sequence)controlsBusy(false);}
});
$('file').addEventListener('change',()=>loadFile($('file').files[0]));
$('example').addEventListener('click',async()=>{
 if(bytes||reading)return;const token=++sequence;controlsBusy(true);clearError();$('status').textContent='טוען נתוני דוגמה מומצאים…';
 try{const response=await fetch('./sample.csv');if(!response.ok)throw Error('דוח הדוגמה לא נטען. אפשר לטעון קובץ מהמכשיר.');const text=await response.text();if(token!==sequence)return;await loadFile(new File([text],'דוח-דוגמה.csv',{type:'text/csv'}),{example:true});}
 catch(e){if(token===sequence)error(e);}
 finally{if(token===sequence)controlsBusy(false);}
});
$('clear').addEventListener('click',reset);
for(const id of ['encoding','delimiter'])$(id).addEventListener('change',decodeAndInspect);
$('header').addEventListener('change',()=>{if(!inspection)return;invalidate();mapping=guessMapping(inspection.rows[Number($('header').value)].cells);mappingView();});
$('mode').addEventListener('change',()=>{invalidate();if(inspection)mappingView();});
$('mapping').addEventListener('change',e=>{if(e.target.dataset.field){mapping[e.target.dataset.field]=Number(e.target.value);invalidate();}});
for(const id of ['dateFormat','decimal','currency','invert','from','to'])$(id).addEventListener('change',invalidate);
$('analyze').addEventListener('click',analyze);
for(const id of ['search','filter','raw'])$(id).addEventListener('input',()=>{page=0;renderRecords();});
$('previous').addEventListener('click',()=>{page--;renderRecords();});$('next').addEventListener('click',()=>{page++;renderRecords();});
$('export').addEventListener('click',()=>{
 if(!result)return;const report={format:'bank-csv-inspection',version:1,sourceKind:sourceIsDemo?'synthetic-example':'selected-file',sourceFormat:inspection.format??'csv',sourceSheet:inspection.sheetName??null,sourceFile:fileName,delimiter:inspection.delimiter,mapping,classification:{scope:'personal',rules,rows:classification,proposal:monthlyProposal(result.records,classification),previewOnly:true},registry,options:{mode:$('mode').value,dateFormat:$('dateFormat').value,decimal:$('decimal').value,defaultCurrency:$('currency').value,invertSign:$('invert').checked,period:{from:$('from').value,to:$('to').value}},...result};
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='bank-csv-inspection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('beforeunload',event=>{if(bytes||reading){event.preventDefault();event.returnValue='';}});

function renderClassification(){
 if(!result)return;classification=classify(result.records,{rules,overrides});
 const rows=result.records.filter(r=>r.valid&&r.inPeriod!==false&&r.currency==='ILS'),pages=Math.max(1,Math.ceil(rows.length/100));classPage=Math.min(classPage,pages-1);
 const byLine=new Map(classification.map(c=>[c.line,c]));
 $('classification').innerHTML='<thead><tr><th>שורה / תאריך</th><th>פעולה ופרטים</th><th>סכום</th><th>הצעה והסבר</th><th>יעד בתקציב</th><th>אישור</th></tr></thead><tbody>'+rows.slice(classPage*100,classPage*100+100).map(r=>{
 const c=byLine.get(r.line),options=Object.entries(destinations).filter(([k])=>compatible(r,k));
 return `<tr><td>${r.line}<br><bdi>${esc(r.date)}</bdi></td><td class="description">${esc(r.description)}<small>${esc([r.details,r.beneficiary,r.purpose].filter(Boolean).join(' · '))}</small></td><td>${money(r.amountCents)}</td><td class="description"><strong>${esc(c.category)}</strong><small>${esc(c.reason)}</small></td><td><select aria-label="יעד לשורה ${r.line}" data-class-line="${r.line}"><option value="">בחר יעד</option>${options.map(([k,v])=>`<option value="${k}" ${c.destination===k?'selected':''}>${esc(v)}</option>`).join('')}</select></td><td><label class="checkbox"><input type="checkbox" aria-label="אישור שורה ${r.line}" data-confirm-line="${r.line}" ${c.confirmed?'checked':''} ${c.destination?'':'disabled'}>${c.confirmed?'אושר':'לבדיקה'}</label></td></tr>`;
 }).join('')+'</tbody>';
 const proposal=monthlyProposal(result.records,classification);
 $('registry-status').textContent=`${registry.entries.length} תנועות רשומות · ${result.duplicates?.duplicate??0} כפולות בדוח · ${result.duplicates?.conflict??0} סתירות. כפולות וסתירות אינן בסכומים שאושרו.`;
 $('registry-accept').disabled=!classification.some(c=>c.confirmed);
 $('classification-status').textContent=`${proposal.included} תנועות אושרו לשדות חודשיים · ${proposal.excluded} אושרו ללא השפעה · ${proposal.pending} ממתינות לבדיקה. לא נשמר דבר בתקציב.`;
 $('monthly-proposal').innerHTML=proposal.months.length?'<div class="table-wrap"><table><thead><tr><th>חודש</th><th>שדה באפליקציה</th><th>סכום שאושר</th></tr></thead><tbody>'+proposal.months.flatMap(m=>Object.entries(m.valuesCents).map(([key,value])=>`<tr><td><bdi>${m.month}</bdi></td><td>${esc(destinations[key])}</td><td>${money(value)}</td></tr>`)).join('')+'</tbody></table></div>':'<p class="help">אשר תנועות כדי לראות את הסכומים המוצעים לאפליקציה.</p>';
 $('class-previous').disabled=classPage===0;$('class-next').disabled=classPage>=pages-1;$('class-page').textContent=`${classPage+1} מתוך ${pages}`;
 $('rules').innerHTML=rules.map((r,i)=>`<p>${esc(r.text)} · ${r.direction==='out'?'כסף יוצא':'כסף נכנס'} → ${esc(destinations[r.destination])} <button class="quiet" data-remove-rule="${i}">הסרת כלל</button></p>`).join('');
}
$('classification').addEventListener('change',e=>{
 const line=Number(e.target.dataset.classLine??e.target.dataset.confirmLine);if(!line)return;
 const current=classification.find(c=>c.line===line);overrides[line]={destination:e.target.dataset.classLine?e.target.value:current.destination,confirmed:e.target.dataset.confirmLine?e.target.checked:false};renderClassification();
});
$('confirm-clear').addEventListener('click',()=>{for(const c of classification)if(c.strength==='clear'&&c.destination&&!Object.hasOwn(overrides,c.line))overrides[c.line]={destination:c.destination,confirmed:true};renderClassification();});
$('rule-add').addEventListener('click',()=>{
 const text=$('rule-text').value.trim(),destination=$('rule-destination').value,direction=$('rule-direction').value;
 if(text.length<3){error(Error('הזן לפחות שלושה תווים שמזהים תנועה ייחודית.'));return;}
 if(destination!=='exclude'&&((direction==='in')!==['salary','otherIncome','incomingTransfers'].includes(destination))){error(Error('כיוון הכסף אינו מתאים לשדה שבחרת.'));return;}
 rules.push({text,direction,destination});$('rule-text').value='';clearError();renderClassification();
});
$('rules').addEventListener('click',e=>{if(e.target.dataset.removeRule!==undefined){rules.splice(Number(e.target.dataset.removeRule),1);renderClassification();}});
$('class-previous').addEventListener('click',()=>{classPage--;renderClassification();});$('class-next').addEventListener('click',()=>{classPage++;renderClassification();});

function downloadRegistry(){const url=URL.createObjectURL(new Blob([JSON.stringify(registry,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='bank-import-registry.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('registry-accept').addEventListener('click',()=>{if(!result||sourceIsDemo){error(Error('דוח הדגמה אינו נכנס לרישום של דוח הבנק.'));return;}try{const accepted=acceptReviewed(registry,result.records,classification,registryScope);registry=accepted.ledger;$('registry-status').textContent=`נוספו ${accepted.added} תנועות לרישום הבדיקה. ${accepted.missingReference} בלי אסמכתא לא נרשמו. לא נשמרו נתונים בתקציב. הורד את הרישום כדי לשמור אותו לבדיקה הבאה.`;$('registry-accept').disabled=true;}catch(e){error(e);}});
$('registry-export').addEventListener('click',downloadRegistry);
$('registry-file').addEventListener('change',async()=>{const file=$('registry-file').files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('רישום הבדיקה גדול מדי.');const next=readLedger(JSON.parse(await file.text()),registryScope);registry=next;analyze();clearError();}catch(e){error(e);}finally{$('registry-file').value='';}});
