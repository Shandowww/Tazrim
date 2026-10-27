import {clone,fields,creditCards,monthlyValues,forecast,confirmMonthlySavings,validatePlan,cents,paymentFor,monthAt,cashAccountList,cashAccountValues,cashAssignedItem} from './budget.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bankMonthSources(p,month){
 const sources=new Map();for(const batch of p.bankImport?.batches??[])for(const h of batch.months??[])if(h.month===month){const c=h.after?.bankCoverage;if(c?.accountId!==batch.accountId)continue;const explicit=Object.hasOwn(c,'sourceBalanceCents');sources.set(batch.accountId,{complete:c.accountComplete??c.complete,balance:explicit?c.sourceBalanceCents:h.after.cashReport?cents(h.after.cashReport.balance):null,date:c.date});}return sources;
}
export function bankMonthComplete(month,from,to){const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);return from<=month+'-01'&&to>=end;}
export function bankDefaultMonthModes(p,preview,asOf,reportScope='complete'){
 return Object.fromEntries(preview.months.map(m=>[m.month,
  m.month<p.startMonth||m.month>asOf||!m.newCount?'skip':
  m.complete&&reportScope!=='partial'?'full':p.months[m.month]?.actual?'skip':'partial'
 ]));
}
export function bankPlannedDirect(p,month,accountId=null){return p.expenses.filter(e=>(!accountId||cashAssignedItem(p,e)===accountId||cashAccountList(p).length<2)&&e.source==='direct'&&paymentFor(e,month)>0).map(e=>({id:e.id,name:e.name,kind:e.kind,amount:paymentFor(e,month)}));}
export function bankImportedSavingSummary(p){
 const entries=(p.bankImport?.entries??[]).filter(e=>['personalSaving','sharedSaving'].includes(e.field)),months=entries.map(e=>e.month).sort();
 return {count:entries.length,totalCents:entries.reduce((n,e)=>n-e.cents,0),from:months[0]??null,to:months.at(-1)??null};
}
// Reclassify a fully sourced monthly transfer total without changing bank
// movement identities or the reported bank balance. Unmatched/manual amounts
// need a separate review and are never silently discarded.
export function excludeInternalBankTransfers(p,month){
 const record=p.months[month],entries=(p.bankImport?.entries??[]).filter(entry=>entry.month===month&&entry.field==='transfers');
 if(!record?.actual||!entries.length||entries.some(entry=>entry.cents>=0))throw Error('יש לבחור חודש שדווח בפועל עם העברות בנק מזוהות.');
 const amount=-entries.reduce((sum,entry)=>sum+entry.cents,0);
 if(amount!==cents(record.values.transfers??0))throw Error('סך ההעברות אינו תואם בדיוק לתנועות שיובאו. יש לבדוק את הפער לפני שינוי הסיווג.');
 const next=clone(p),monthly=next.months[month];monthly.values.transfers=0;monthly.values.outgoingTransfers=(cents(monthly.values.outgoingTransfers??0)+amount)/100;
 const byAccount=new Map();for(const entry of entries)byAccount.set(entry.accountId,(byAccount.get(entry.accountId)??0)-entry.cents);
 for(const [accountId,centsToRemove]of byAccount){const account=next.cashPlanning?.months?.[month]?.[accountId];if(!account)continue;if(cents(account.values.transfers??0)<centsToRemove)throw Error('פירוט ההעברות בחשבון אינו תואם לסכום שיובא.');account.values.transfers=(cents(account.values.transfers)-centsToRemove)/100;account.values.outgoingTransfers=(cents(account.values.outgoingTransfers??0)+centsToRemove)/100;}
 for(const entry of next.bankImport.entries)if(entry.month===month&&entry.field==='transfers')entry.field='outgoingTransfers';
 if(!validatePlan(next))throw Error('לא ניתן לתקן את סיווג ההעברות בתקציב הזה.');
 return next;
}
export async function bankIdentity(record,accountId,digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('')){
 const context=[record.date,record.amountCents,record.description,record.details,record.beneficiary,record.purpose].map(v=>String(v??'').normalize('NFKC').trim());
 const reference=record.reference?.trim();return {...record,key:await digest(JSON.stringify([accountId,'hapoalim',reference||context,record.date])),fingerprint:await digest(JSON.stringify(context)),missingReference:!reference};
}
export function bankPreview(p,records,options){
 const {accountId,from,to,choices={},modes={}}=options,stored=p.bankImport?.entries??[],known=new Map(stored.map(e=>[e.key,e])),seen=new Map(),rows=[];
 const migrationKeys=new Set((p.importMigrationGuards?.movements??[]).map(e=>e.key)),migrationFingerprints=new Set((p.importMigrationGuards?.movements??[]).map(e=>e.fingerprint));
 const allowed=new Set([...fields.map(f=>f[0]),...creditCards(p).map(c=>c.id),'exclude']);
 for(const r of records){
  const previous=known.get(r.key)??seen.get(r.key),withinFile=seen.has(r.key);let state=!r.valid||r.currency!=='ILS'||!r.date||r.date<from||r.date>to?'invalid':previous?(previous.fingerprint===r.fingerprint?(withinFile?'duplicate-file':'duplicate'):'conflict'):'new';
  if(r.missingReference&&previous&&state!=='invalid')state='conflict';
  const crossFormatOverlap=r.missingReference&&(p.bankImport?.batches??[]).some(b=>b.accountId===accountId&&r.date>=b.from&&r.date<=b.to&&(/\.pdf$/i.test(b.file)!==/\.pdf$/i.test(options.fileName??''))&&(/\.pdf$/i.test(b.file)||/\.pdf$/i.test(options.fileName??'')));if(crossFormatOverlap)state='conflict';
  const c=choices[r.line]??{},field=state==='duplicate'?previous.field:c.field;
  if(state!=='invalid'&&(migrationKeys.has(r.key)||migrationFingerprints.has(r.fingerprint)))state='migrated';
  const reviewed=['duplicate','duplicate-file'].includes(state)||state==='new'&&c.reviewed===true&&allowed.has(field)&&(field==='exclude'||(['salary','otherIncome','incomingTransfers'].includes(field)?r.amountCents>0:r.amountCents<0||field!=='outgoingTransfers'&&(r.reversal===true||c.refund===true)&&r.amountCents>0));
  const row={...r,state,field,reviewed,accountId};rows.push(row);if(!seen.has(r.key)&&!['invalid','conflict'].includes(state))seen.set(r.key,{fingerprint:r.fingerprint,field});
 }
 const conflicts=new Set(rows.filter(r=>r.state==='conflict').map(r=>r.key));for(const r of rows)if(conflicts.has(r.key)&&r.state==='new'){r.state='conflict';r.reviewed=false;}
 const months=[...new Set(rows.filter(r=>r.date&&r.date>=from&&r.date<=to).map(r=>r.date.slice(0,7)))].sort().map(month=>{
  const selected=rows.filter(r=>r.date?.startsWith(month)),accountValues={},complete=bankMonthComplete(month,from,to),mode=modes[month]??'skip',values={},pending=selected.filter(r=>!r.reviewed||['invalid','conflict'].includes(r.state)).length;
  for(const e of stored)if(e.month===month&&e.field!=='exclude'&&(e.accountId!==accountId||mode==='partial')){if(e.accountId!==accountId&&p.cashPlanning?.months[month]?.[e.accountId]){values[e.field]??=0;continue;}values[e.field]=(values[e.field]??0)+(['salary','otherIncome','incomingTransfers'].includes(e.field)?e.cents:-e.cents);if(e.accountId===accountId)accountValues[e.field]=(accountValues[e.field]??0)+(['salary','otherIncome','incomingTransfers'].includes(e.field)?e.cents:-e.cents);}
  for(const [otherId,record]of Object.entries(p.cashPlanning?.months[month]??{}))if(otherId!==accountId)for(const [field,value]of Object.entries(record.values))if(value||Object.hasOwn(values,field))values[field]=(values[field]??0)+cents(value);
  for(const r of selected)if(r.reviewed&&r.field!=='exclude'&&!['invalid','conflict','duplicate-file'].includes(r.state)&&(mode!=='partial'||r.state==='new')){values[r.field]=(values[r.field]??0)+(['salary','otherIncome','incomingTransfers'].includes(r.field)?r.amountCents:-r.amountCents);accountValues[r.field]=(accountValues[r.field]??0)+(['salary','otherIncome','incomingTransfers'].includes(r.field)?r.amountCents:-r.amountCents);}
  const ownExisting=cashAccountValues(p,accountId,month).values;for(const [field,value]of Object.entries(ownExisting))if(value&&!Object.hasOwn(accountValues,field))values[field]=(values[field]??0)+cents(value);
  const latest=selected.filter(r=>r.valid&&r.balanceCents!==null).sort((a,b)=>b.date.localeCompare(a.date))[0]?.date,balances=[...new Set(selected.filter(r=>r.valid&&r.date===latest&&r.balanceCents!==null).map(r=>r.balanceCents))];
  const orderedPDF=selected.filter(r=>r.valid&&r.balanceCents!==null&&Number.isInteger(r.pdfOrder)).sort((a,b)=>b.pdfOrder-a.pdfOrder)[0],sourceBalance=orderedPDF?{date:orderedPDF.date,cents:orderedPDF.balanceCents}:balances.length===1?{date:latest,cents:balances[0]}:null,sources=bankMonthSources(p,month);for(const [otherId,r]of Object.entries(p.cashPlanning?.months[month]??{}))sources.set(otherId,{complete:r.actual,balance:r.balance===undefined?null:cents(r.balance),date:r.date??monthAt(month,1)+'-01'});sources.delete(accountId);const otherSources=[...sources.values()];
  const jointBalance=sourceBalance&&otherSources.every(s=>s.balance!==null&&s.date===sourceBalance.date)?{date:sourceBalance.date,cents:sourceBalance.cents+otherSources.reduce((n,s)=>n+s.balance,0)}:null;
  return {month,mode,complete,pending,values,accountValues,newCount:selected.filter(r=>r.state==='new').length,sourceBalance,balance:jointBalance,accountCount:otherSources.length+1,otherSourcesComplete:otherSources.every(s=>s.complete),old:monthlyValues(p,month)};
 });
 return {rows,months};
}
// Group only reviewable new rows. Amounts, dates and references stay per row;
// similar transactions are not duplicate identities and are never collapsed.
export function bankReviewGroups(rows){
 const normalize=value=>String(value??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim().toLowerCase(),groups=new Map();
 for(const r of rows){
  if(r.state!=='new')continue;
  const action=normalize(r.description),beneficiary=normalize(r.beneficiary),direction=r.amountCents<0?'out':r.amountCents>0?'in':'zero';
  const key=JSON.stringify([action,beneficiary,direction,action||beneficiary?null:r.line]);
  if(!groups.has(key))groups.set(key,{action:r.description||'פעולה ללא תיאור',beneficiary:r.beneficiary||'',direction,rows:[]});
  groups.get(key).rows.push(r);
 }
 return [...groups.values()].map((g,id)=>{
  const pending=g.rows.filter(r=>!r.reviewed),fields=new Set((pending.length?pending:g.rows).map(r=>r.field||'')),dates=g.rows.map(r=>r.date).sort(),amounts=g.rows.map(r=>r.amountCents);
  return {...g,id:String(id),pending,field:fields.size===1?[...fields][0]:'',mixed:fields.size>1,totalCents:amounts.reduce((n,a)=>n+a,0),minCents:Math.min(...amounts),maxCents:Math.max(...amounts),from:dates[0],to:dates.at(-1)};
 });
}
export function bankRememberedRules(rules,records,choices,enabled=true){
 const result=clone(rules);if(!enabled)return result;
 const normalize=s=>String(s??'').normalize('NFKC').replace(/[״׳"']/g,'').replace(/\s+/g,' ').trim().toLowerCase(),groups=new Map();
 for(const r of records){const c=choices[r.line];if(!c?.reviewed||!c.field||r.reversal)continue;const action=normalize(r.description),beneficiary=normalize(r.beneficiary),direction=r.amountCents<0?'out':'in';if(!(action||beneficiary)||action.length>160||beneficiary.length>160)continue;const key=JSON.stringify([action,beneficiary,direction]);if(!groups.has(key))groups.set(key,{action,beneficiary,direction,choices:[]});groups.get(key).choices.push(c);}
 for(const g of groups.values()){if(!g.choices.some(c=>c.manual))continue;const destinations=new Set(g.choices.map(c=>JSON.stringify([c.field,!!c.refund]))),old=result.findIndex(r=>r.action!==undefined&&normalize(r.action)===g.action&&normalize(r.beneficiary)===g.beneficiary&&r.direction===g.direction);if(destinations.size!==1){if(old>=0)result.splice(old,1);continue;}const c=g.choices[0],rule={text:g.beneficiary||g.action,action:g.action,beneficiary:g.beneficiary,direction:g.direction,destination:c.field,refund:!!c.refund};if(old>=0)result[old]=rule;else if(result.length<100)result.push(rule);}
 return result;
}
export function applyBankImport(p,records,options){
 const {id,accountId,label,rules=[],from,to,asOf,coverageConfirmed,monthsConfirmed,transferIds=[]}=options;
 const previousAccount=p.bankImport?.accounts.find(a=>a.id===accountId);if(previousAccount?.bankName&&options.bankName&&previousAccount.bankName!==options.bankName)throw Error('לייבוא מבנק אחר בחר חשבון נוסף.');
 if(!coverageConfirmed||!monthsConfirmed||!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||from>to||to>asOf+'-31')throw Error('יש לאשר את טווח הדוח ואת השינויים החודשיים לפני קליטה.');
 const preview=bankPreview(p,records,options),selected=preview.months.filter(m=>m.mode!=='skip');
 if(!selected.length)throw Error('בחר לפחות חודש אחד לקליטה.');
 if(preview.rows.some(r=>r.state==='invalid'&&!r.date))throw Error('יש שורות ללא תאריך תקין. תקן את הדוח או את מבנה העמודות לפני קליטה.');
 const next=clone(p),beforeGoals=clone(p.savingsGoals??null),beforeTransfers=clone(p.savingTransfers??null),history=[];
 for(const m of selected){
  if(m.month>asOf||!m.newCount||m.pending)throw Error('יש להשלים את בדיקת התנועות בחודשים שנבחרו; חודש בלי תנועות חדשות לא נקלט שוב.');
  if(m.mode==='full'&&(!m.complete||options.reportScope==='partial')||!['full','partial'].includes(m.mode))throw Error('חודש חלקי אינו יכול להחליף חודש מלא.');
  if(m.mode==='partial'&&p.months[m.month]?.actual)throw Error('אין להחליף דיווח מלא קיים בדוח חלקי. השאר את החודש ללא שינוי.');
  if(m.month<p.startMonth)throw Error('חודש הדוח קודם לתחילת התקציב. שנה את תחילת התכנון בהגדרות או השאר חודש זה ללא שינוי.');
  if(cashAccountList(p).length>1&&p.expenses.some(e=>e.source==='direct'&&paymentFor(e,m.month)>0&&!cashAssignedItem(p,e)))throw Error('יש תכנון ללא חשבון משלם בחודש '+m.month+'. שייך אותו לחשבון לפני ייבוא.');
  if(bankPlannedDirect(p,m.month,accountId).length&&typeof options.directIncluded?.[m.month]!=='boolean')throw Error('בחודש '+m.month+' יש תכנון קיים. בחר אם הוא כבר כלול בדוח או עדיין נוסף עליו.');
  if(Object.values(m.accountValues).some(n=>n<0))throw Error('זיכוי או ביטול גדול מהחיובים באותו חודש ושדה. ודא שזה החזר של תשלום; כספי הלוואה חדשה ומשיכת חיסכון דורשים התאמת יתרות נפרדת.');
  history.push({month:m.month,before:clone(p.months[m.month]??null),beforeCash:clone(p.cashPlanning?.months[m.month]??null)});
  if(next.cashPlanning?.months[m.month]?.[accountId]){const r=next.cashPlanning.months[m.month][accountId];for(const [field,value]of Object.entries(m.accountValues))r.values[field]=value/100;r.actual=m.mode==='full';r.includesPlannedCard=Object.keys(m.accountValues).some(k=>k.startsWith('card'));r.includesPlannedDirect=options.directIncluded?.[m.month]===true;r.bankImported=true;if(m.sourceBalance){r.balance=m.sourceBalance.cents/100;r.date=m.sourceBalance.date;}else{delete r.balance;delete r.date;}}
  const values={...monthlyValues(p,m.month)};for(const [field,value]of Object.entries(m.values))values[field]=value/100;
  next.months[m.month]={...(next.months[m.month]??{}),values,actual:m.mode==='full'&&m.otherSourcesComplete,includesPlannedCard:Object.keys(m.values).some(k=>k.startsWith('card'))||p.months[m.month]?.includesPlannedCard===true,includesPlannedDirect:options.directIncluded?.[m.month]===true,bankCoverage:{from:from>m.month+'-01'?from:m.month+'-01',to:to,date:m.sourceBalance?.date??to,complete:m.mode==='full'&&m.otherSourcesComplete,accountComplete:m.mode==='full',sourceBalanceCents:m.sourceBalance?.cents??null,accountId}};
  // Other fields remain intact. This report replaces reviewed fields, never adds to manual totals.
 }
 for(const transferId of transferIds){const t=next.savingTransfers?.find(t=>t.id===transferId&&t.status==='pending'),m=selected.find(m=>m.month===t?.month);if(!t||!m||((m.values.personalSaving??0)<cents(t.personal))||((m.values.sharedSaving??0)<cents(t.shared)))throw Error('ההעברה שסומנה אינה מכוסה בחיסכון שנקלט בדוח.');t.status='completed';}
 for(const m of selected){
  if(next.savingsGoals&&m.month>=next.savingsGoals.snapshotMonth&&m.month>=next.startMonth)Object.assign(next,confirmMonthlySavings(next,m.month,asOf));
  if(m.accountCount>1&&!m.balance)delete next.months[m.month].cashReport;
  if(m.balance){const rows=forecast({...next,startMonth:m.month<next.startMonth?m.month:next.startMonth});const net=rows.find(r=>r.month===m.month)?.net;if(net===undefined)throw Error('החודש מחוץ לתקופת התכנון.');next.months[m.month].cashReport={balance:m.balance.cents/100,net:net+(next.savingTransfers??[]).filter(t=>t.status==='pending'&&t.month===m.month).reduce((n,t)=>n+cents(t.personal)+cents(t.shared),0)/100};}
 }
 const bank=next.bankImport??={version:1,accounts:[],entries:[],batches:[]};if(bank.batches.some(b=>b.id===id))throw Error('הדוח כבר נקלט.');
 const accountIndex=bank.accounts.findIndex(a=>a.id===accountId),accountBefore=clone(bank.accounts.find(a=>a.id===accountId)??null),account={id:accountId,label,rules,personal:options.personal===true,...(options.bankName?{bankName:options.bankName}:{})};if(accountIndex<0)bank.accounts.push(account);else bank.accounts[accountIndex]=account;
 const accepted=preview.rows.filter(r=>r.state==='new'&&r.reviewed&&selected.some(m=>m.month===r.date.slice(0,7)));
 bank.entries.push(...accepted.map(r=>({key:r.key,fingerprint:r.fingerprint,month:r.date.slice(0,7),field:r.field,cents:r.amountCents,batchId:id,accountId,source:{...(Number.isInteger(r.line)&&r.line>0&&r.line<=30000?{line:r.line,parserVersion:1}:{}),date:r.date,valueDate:r.valueDate??null,description:r.description??'',details:r.details??'',beneficiary:r.beneficiary??'',purpose:r.purpose??'',reference:r.reference??'',currency:r.currency??'ILS',...(Number.isSafeInteger(r.balanceCents)?{balanceCents:r.balanceCents}:{})}})));
 for(const h of history){h.after=clone(next.months[h.month]);h.afterCash=clone(next.cashPlanning?.months[h.month]??null);}
 bank.batches.push({id,accountId,file:options.fileName,from,to,months:history,beforeGoals,afterGoals:clone(next.savingsGoals??null),beforeTransfers,afterTransfers:clone(next.savingTransfers??null),accountBefore,accountIndex,accountAfter:account});
 if(!validatePlan(next)||JSON.stringify(next).length>2000000)throw Error('הייבוא גדול מדי או אינו מתאים לתקציב. נסה תקופה קצרה יותר; שום נתון לא נשמר.');
 return next;
}
export function undoBankImport(p,id){
 const last=p.bankImport?.batches.at(-1);if(last?.migrationBaseline)throw Error('רישום זה הוא קו בסיס של מעבר חשבון. אין לבטל ייבוא ישן בנפרד; השתמשו בביטול המעבר המוגן אם הוא עדיין זמין.');if(!last||last.id!==id)throw Error('אפשר לבטל את הייבוא האחרון בלבד, כדי לשמור על סדר הדוחות.');
 if(!same(p.bankImport.accounts.find(a=>a.id===last.accountId)??null,last.accountAfter))throw Error('כללי החשבון השתנו מאז הייבוא. אין לבטל אותם אוטומטית.');
 if(last.months.some(h=>!same(p.months[h.month]??null,h.after)||Object.hasOwn(h,'afterCash')&&!same(p.cashPlanning?.months[h.month]??null,h.afterCash))||!same(p.savingsGoals??null,last.afterGoals)||!same(p.savingTransfers??null,last.afterTransfers))throw Error('הנתונים השתנו מאז הייבוא. ביטול אוטומטי עלול למחוק עריכה; יש להשוות לגיבוי או לתקן את החודש.');
 const next=clone(p);for(const h of last.months){if(h.before)next.months[h.month]=h.before;else delete next.months[h.month];if(Object.hasOwn(h,'beforeCash')&&next.cashPlanning){if(h.beforeCash)next.cashPlanning.months[h.month]=h.beforeCash;else delete next.cashPlanning.months[h.month];}}
 if(last.beforeGoals)next.savingsGoals=last.beforeGoals;else delete next.savingsGoals;if(last.beforeTransfers)next.savingTransfers=last.beforeTransfers;else delete next.savingTransfers;
 next.bankImport.entries=next.bankImport.entries.filter(e=>e.batchId!==id);next.bankImport.batches.pop();next.bankImport.accounts=next.bankImport.accounts.filter(a=>a.id!==last.accountId);if(last.accountBefore)next.bankImport.accounts.splice(Number.isInteger(last.accountIndex)&&last.accountIndex>=0?last.accountIndex:next.bankImport.accounts.length,0,last.accountBefore);
 if(!validatePlan(next))throw Error('לא ניתן לבטל את הייבוא עם הנתונים הקיימים.');return next;
}
