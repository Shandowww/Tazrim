import {prepareCardAccountMigration} from './card-account-migration.js';
import {clone,validatePlan,fields,zero,cents,forecast,cashAccountForecast,addImportMigrationGuards,indexMonth} from './budget.js';
import {spaceEntityKey,budgetSpaceScope} from './space-model.js';
import {reviewAccountMigration} from './space-migration-model.js';
const basicKeys=new Set(['startMonth','opening','buffer','horizon','defaults','months','expenses','demo','setupCompleted','cashPlanning','displayName','goals','creditCards','loans','details','importMigrationGuards','retainedImportHistory','savingsMigrationGuards','retainedSavingsHistory','savingsBaselineHistory','cardMigrationGuards']);
const valueKeys=fields.map(([k])=>k),sensitive=new Set(fields.filter(([, ,kind])=>kind==='saving').map(([k])=>k));
const allZero=v=>Object.values(v??{}).every(n=>n===0);
const values=v=>Object.fromEntries(valueKeys.map(k=>[k,cents(v?.[k]??0)]));
const sameValues=(a,b)=>valueKeys.every(k=>cents(a?.[k]??0)===cents(b?.[k]??0));
const migrationForecast=p=>forecast(p,undefined,Math.max(0,...Object.keys(p.months).map(month=>indexMonth(month)-indexMonth(p.startMonth)+1)));
// Deliberately restricted first path. Unsupported sections are never silently dropped.
export function prepareManualAccountMigration(source,target,{user,sourceId,targetId,accountId}){
 const reasons=[],deny=(code,message)=>{if(!reasons.some(r=>r.code===code))reasons.push({code,message});};
 if(!validatePlan(source)||!validatePlan(target)||sourceId===targetId)return{eligible:false,reasons:[{code:'invalid',message:'יש לבחור שני תקציבים שמורים ותקינים.'}]};
 if(source.bankImport!==undefined){try{return prepareImportedAccountMigration(source,target,{user,sourceId,targetId,accountId});}catch{return{eligible:false,reasons:[{code:'import-preparation',message:'מקורות הייבוא אינם עומדים בכל בדיקות המעבר. שום נתון לא שונה; יש לברר את דיווחי החשבון לפני מעבר.'}]};}}
 if(source.creditCards!==undefined||Object.keys(source.cashPlanning?.cardAccounts??{}).length)return prepareCardAccountMigration(source,target,{user,sourceId,targetId,accountId},prepareManualAccountMigration);
 const account=source.cashPlanning?.accounts.find(a=>a.id===accountId);
 if(!account)deny('account','החשבון חייב להיות חשבון ידני מוגדר במקור.');
 for(const [name,p]of [['מקור',source],['יעד',target]]){
  if(Object.keys(p).some(k=>!basicKeys.has(k)))deny('dependencies','המסלול הראשון אינו מעביר דוחות, חסכון, חיבורים, קישורי ראיות או סוגי נתונים נוספים.');
  if(p.demo)deny('demo','אין מעבר של נתוני דוגמה.');
  if(p===target&&(p.expenses.length||(p.loans?.length??0)||(p.details?.length??0)))deny('target-commitments','היעד חייב להיות ריק גם מהתחייבויות, הלוואות ופירוט צ׳קים.');
  if(p.creditCards!==undefined)deny('cards','כרטיסים מותאמים דורשים מסלול מעבר נפרד.');
  if(p.cashPlanning&&(Object.keys(p.cashPlanning).some(k=>!['accounts','months','cardAccounts','transfers'].includes(k))||Object.keys(p.cashPlanning.cardAccounts).length||p.cashPlanning.transfers.length))deny('account-links','שיוכי כרטיסים והעברות בין חשבונות דורשים סקירה וטיפול נפרדים.');
  if(Object.values(p.months).some(r=>Object.keys(r).some(k=>!['values','actual','includesPlannedCard','includesPlannedDirect'].includes(k))))deny('month-evidence','דיווחים עם מסמכי בנק, יתרות כלליות או הערות אינם מועברים במסלול הראשון.');
  for(const v of [p.defaults,...Object.values(p.months).map(r=>r.values),...(p.cashPlanning?.accounts??[]).map(a=>a.defaults),...Object.values(p.cashPlanning?.months??{}).flatMap(rs=>Object.values(rs).map(r=>r.values))])if(v&&Object.entries(v).some(([k,n])=>n!==0&&(sensitive.has(k)||k.startsWith('card'))))deny('saving-card-amounts','סכומי חסכון, השקעה וכרטיסים מחייבים טיפול בבעלות ובתלויות לפני מעבר.');
 }
 if(source.startMonth!==target.startMonth||source.horizon!==target.horizon)deny('period','תחילת התקציב ואופק התכנון חייבים להיות זהים במסלול הראשון.');
 if(target.opening!==0||!allZero(target.defaults)||Object.keys(target.months).length||(target.cashPlanning?.accounts.length??0)||(target.cashPlanning&&Object.keys(target.cashPlanning.months).length))deny('target-not-empty','היעד חייב להיות תקציב שמור וריק מנתונים כספיים ומחשבונות.');
 const accounts=source.cashPlanning?.accounts??[];
 const accountIds=new Set(accounts.map(a=>a.id));
 for(const e of source.expenses){
  if(e.source!=='direct'||e.cardId!==undefined||Object.keys(e).some(k=>!['id','name','amount','fees','firstMonth','payments','source','kind','cashAccountId'].includes(k)))deny('unsupported-commitment','התחייבות בכרטיס או עם שדות נוספים דורשת מסלול מעבר נפרד.');
  if(typeof e.cashAccountId!=='string'||!accountIds.has(e.cashAccountId))deny('unassigned-commitment','לכל התחייבות נדרש שיוך מפורש לחשבון משלם; אין שיוך אוטומטי גם כשנשאר חשבון יחיד.');
 }
 for(const detail of source.details??[]){
  if(detail.method!=='checks'||Object.keys(detail).some(k=>!['id','name','category','method','amount','month','date','number','status','accounting','cashAccountId'].includes(k)))deny('unsupported-detail','רק צ׳קים ידניים ללא מסמכים, קישורי מקור או שדות נוספים נתמכים במסלול זה.');
  if(typeof detail.cashAccountId!=='string'||!accountIds.has(detail.cashAccountId))deny('unassigned-detail','לכל צ׳ק נדרש שיוך מפורש לחשבון משלם; אין שיוך לפי שם או חשבון יחיד.');
 }
 for(const loan of source.loans??[]){
  if(Object.keys(loan).some(k=>!['id','name','monthly','from','months','cashAccountId'].includes(k)))deny('unsupported-loan','הלוואה עם שדות או קישורי מקור נוספים דורשת סקירה נפרדת.');
  if(typeof loan.cashAccountId!=='string'||!accountIds.has(loan.cashAccountId))deny('unassigned-loan','לכל הלוואה נדרש שיוך מפורש לחשבון משלם לפני מעבר.');
 }
 if(!accounts.length||accounts.some(a=>a.opening===undefined||(a.openingMonth??source.startMonth)!==source.startMonth||Object.keys(a).some(k=>!['id','label','opening','openingMonth','buffer','defaults','color'].includes(k))))deny('opening','לכל חשבון במקור נדרשת יתרת פתיחה ידועה בחודש תחילת התקציב וללא שדות חשבון לא נתמכים.');
 if(cents(source.opening)!==accounts.reduce((n,a)=>n+cents(a.opening??0),0))deny('unassigned-opening','יתרת הפתיחה הכללית אינה תואמת בדיוק לחשבונות.');
 if(valueKeys.some(k=>cents(source.defaults[k]??0)!==accounts.reduce((n,a)=>n+cents(a.defaults?.[k]??0),0)))deny('unassigned-defaults','הערכות הבסיס אינן תואמות בדיוק להערכות החשבונות.');
 const months=new Set([...Object.keys(source.months),...Object.keys(source.cashPlanning?.months??{})]);
 for(const month of months){
  const aggregate=source.months[month],records=source.cashPlanning?.months[month]??{};
  if(!aggregate||accounts.some(a=>!records[a.id])){deny('missing-account-month','לכל חודש נדרש דיווח מפורש של כל חשבונות המקור; אין השלמה אוטומטית של חסרים.');continue;}
  if(valueKeys.some(k=>cents(aggregate.values[k]??0)!==accounts.reduce((n,a)=>n+cents(records[a.id].values[k]??0),0)))deny('unassigned-month','הסיכום החודשי אינו תואם בדיוק לפירוט החשבונות.');
  if(accounts.some(a=>{const r=records[a.id];return Object.keys(r).some(k=>!['values','actual','includesPlannedCard','includesPlannedDirect','balance','date'].includes(k))||r.actual!==aggregate.actual||!!r.includesPlannedCard!==!!aggregate.includesPlannedCard||!!r.includesPlannedDirect!==!!aggregate.includesPlannedDirect;}))deny('coverage','מצבי הדיווח חייבים להתאים ויש להסיר תלות בראיות שאינן נתמכות במסלול הראשון.');
 }
 if(reasons.length)return{eligible:false,reasons};
 const from=clone(source),to=clone(target),moved=clone(account),others=accounts.filter(a=>a.id!==accountId);
 from.expenses=source.expenses.filter(e=>e.cashAccountId!==accountId).map(clone);to.expenses=source.expenses.filter(e=>e.cashAccountId===accountId).map(clone);
 if(source.details!==undefined){from.details=source.details.filter(e=>e.cashAccountId!==accountId).map(clone);to.details=source.details.filter(e=>e.cashAccountId===accountId).map(clone);}
 if(source.loans!==undefined){from.loans=source.loans.filter(e=>e.cashAccountId!==accountId).map(clone);to.loans=source.loans.filter(e=>e.cashAccountId===accountId).map(clone);}
 from.cashPlanning.accounts=from.cashPlanning.accounts.filter(a=>a.id!==accountId);from.opening=(cents(source.opening)-cents(account.opening))/100;
 from.defaults=Object.fromEntries(valueKeys.map(k=>[k,(cents(source.defaults[k]??0)-cents(account.defaults?.[k]??0))/100]));
 to.opening=account.opening;to.defaults={...zero(),...clone(account.defaults??{})};to.cashPlanning={accounts:[moved],months:{},cardAccounts:{},transfers:[]};
 for(const month of [...months].sort()){
  const r=clone(source.cashPlanning.months[month][accountId]);to.cashPlanning.months[month]={[accountId]:r};
  to.months[month]={values:clone(r.values),actual:r.actual,includesPlannedCard:r.includesPlannedCard,includesPlannedDirect:r.includesPlannedDirect};
  delete from.cashPlanning.months[month][accountId];
  if(!others.length){delete from.cashPlanning.months[month];delete from.months[month];}
  else from.months[month].values=Object.fromEntries(valueKeys.map(k=>[k,(cents(source.months[month].values[k]??0)-cents(r.values[k]??0))/100]));
 }
 if(!validatePlan(from)||!validatePlan(to))throw Error('Invalid migration result');
 const beforeSource=migrationForecast(source),length=beforeSource.length,afterSource=forecast(from,undefined,length),afterTarget=forecast(to,undefined,length);
 for(let i=0;i<beforeSource.length;i++)for(const field of ['income','incomingTransfers','outgoingTransfers','spending','saving','planned','net','balance'])if(cents(beforeSource[i][field]??0)!==cents(afterSource[i][field]??0)+cents(afterTarget[i][field]??0))throw Error('Migration conservation failure');
 const beforeAccount=cashAccountForecast(source,accountId,[],length),afterAccount=cashAccountForecast(to,accountId,[],length);
 for(let i=0;i<beforeAccount.length;i++)for(const field of ['balance','net'])if(beforeAccount[i][field]!==afterAccount[i][field])throw Error('Account projection changed');
 for(const other of others){const before=cashAccountForecast(source,other.id,[],length),after=cashAccountForecast(from,other.id,[],length);for(let i=0;i<length;i++)for(const field of ['balance','net'])if(before[i][field]!==after[i][field])throw Error('Remaining account projection changed');}
 const reference=spaceEntityKey(budgetSpaceScope(user,sourceId),'account',accountId),destination=spaceEntityKey(budgetSpaceScope(user,targetId),'account',accountId);
 return {eligible:true,reasons:[],sourceAfter:from,targetAfter:to,manifest:{account:{id:accountId,name:account.label,sourceRef:reference,targetRef:destination},openingCents:cents(account.opening),cheques:(to.details??[]).map(e=>({...clone(e),amountCents:cents(e.amount),sourceRef:spaceEntityKey(budgetSpaceScope(user,sourceId),'detail',e.id),targetRef:spaceEntityKey(budgetSpaceScope(user,targetId),'detail',e.id)})),commitments:to.expenses.map(e=>({id:e.id,name:e.name,kind:e.kind,totalCents:cents(e.amount)+cents(e.fees),firstMonth:e.firstMonth,payments:e.payments,sourceRef:spaceEntityKey(budgetSpaceScope(user,sourceId),'expense',e.id),targetRef:spaceEntityKey(budgetSpaceScope(user,targetId),'expense',e.id)})),loans:(to.loans??[]).map(e=>({id:e.id,name:e.name,monthlyCents:cents(e.monthly),firstMonth:e.from,months:e.months,sourceRef:spaceEntityKey(budgetSpaceScope(user,sourceId),'loan',e.id),targetRef:spaceEntityKey(budgetSpaceScope(user,targetId),'loan',e.id)})),months:[...months].sort(),defaultsCents:values(account.defaults),comparisons:beforeSource.map((r,i)=>({month:r.month,sourceBeforeBalanceCents:cents(r.balance),sourceAfterBalanceCents:cents(afterSource[i].balance),targetAfterBalanceCents:cents(afterTarget[i].balance),sourceBeforeNetCents:cents(r.net),sourceAfterNetCents:cents(afterSource[i].net),targetAfterNetCents:cents(afterTarget[i].net),sourceBeforeActual:r.actual,sourceAfterActual:afterSource[i].actual,targetAfterActual:afterTarget[i].actual,flows:['income','incomingTransfers','outgoingTransfers','spending','saving','planned'].map(field=>({field,beforeCents:cents(r[field]??0),sourceAfterCents:cents(afterSource[i][field]??0),targetBeforeCents:0,targetAfterCents:cents(afterTarget[i][field]??0)}))})),retained:'Original history, other accounts, personal display/settings and all external records stay at source; no documents or connections are copied.'}};
}

// First imported path: complete assigned plaintext records, no aggregate balance
// ambiguity, no external intake and no cards/savings/evidence. All other paths stay
// blocked. The existing manual splitter checks every financial invariant again.
function prepareImportedAccountMigration(source,target,options){
 const reasons=[],deny=(code,message)=>{if(!reasons.some(r=>r.code===code))reasons.push({code,message});},accountId=options.accountId;
 const bank=source.bankImport,selectedAccounts=bank.accounts.filter(a=>a.id===accountId),selected=bank.entries.filter(e=>e.accountId===accountId),batches=bank.batches.filter(b=>b.accountId===accountId),batchIds=new Set(batches.map(b=>b.id));
 if(selected.some(e=>sensitive.has(e.field)||e.field.startsWith('card')))deny('import-saving-card-evidence','תנועות מקור של חסכון, השקעה או כרטיס דורשות סקירת בעלות ותלות נפרדת גם כשהסכום החודשי נטו הוא אפס.');
 if(source.creditCards!==undefined||target.creditCards!==undefined||Object.keys(source.cashPlanning?.cardAccounts??{}).length)deny('import-card-config','נתוני כרטיסים יחד עם מקורות בנק דורשים מסלול מעבר נפרד.');
 if(selectedAccounts.length!==1||!selected.length||!batches.length)deny('import-account','נדרש חשבון מיובא עם תנועות ודוחות שמורים ומזוהים.');
 if(Object.keys(source).some(k=>!basicKeys.has(k)&&!['bankImport','reportInbox'].includes(k)))deny('import-dependencies','מקור מיובא עם חסכון, כרטיסים או סוגי ראיות נוספים דורש מסלול מעבר נפרד.');
 if(Object.keys(bank).some(k=>!['version','accounts','entries','batches'].includes(k))||bank.accounts.some(a=>Object.keys(a).some(k=>!['id','label','rules','personal','bankName'].includes(k))))deny('import-metadata','יש שדות ייבוא שלא נכללו בחוזה המעבר.');
 if(source.cashPlanning?.accounts.some(a=>a.bankName!==undefined&&!['hapoalim','one-zero'].includes(a.bankName))||selectedAccounts.some(a=>a.bankName&&source.cashPlanning?.accounts.find(c=>c.id===a.id)?.bankName&&a.bankName!==source.cashPlanning.accounts.find(c=>c.id===a.id).bankName))deny('import-bank-identity','זהות הבנק בתכנון ובייבוא אינה תואמת. אין להסיק התאמה לפי שם החשבון.');
 if(bank.accounts.some(a=>!source.cashPlanning?.accounts.some(c=>c.id===a.id)))deny('import-assignment','כל חשבון מיובא חייב להופיע גם בתכנון החשבונות עם יתרת פתיחה ודיווחים מפורשים.');
 if(source.reportInbox&&Object.keys(source.reportInbox).some(k=>!['version','bindings','receipts'].includes(k)))deny('inbox-metadata','יש פרטי קליטה נוספים שאינם נתמכים במעבר.');
 if((source.reportInbox?.bindings??[]).some(b=>b.kind!=='bank')||(source.reportInbox?.receipts??[]).some(r=>r.kind!=='bank'))deny('card-intake','קליטת כרטיסים דורשת סקירת תלות נפרדת.');
 if(Object.values(source.months).some(r=>!r.actual||Object.keys(r).some(k=>!['values','actual','includesPlannedCard','includesPlannedDirect','bankCoverage','cashReport'].includes(k))||r.bankCoverage&&(!r.bankCoverage.complete||!r.bankCoverage.accountComplete)))deny('import-coverage','המסלול המיובא דורש חודשים מלאים ללא שדות חודש נוספים. יתרה כללית דורשת יתרות מפורשות ותואמות לכל החשבונות באותו תאריך.');
 if(Object.values(source.cashPlanning?.months??{}).some(records=>Object.values(records).some(r=>!r.actual||Object.keys(r).some(k=>!['values','actual','includesPlannedCard','includesPlannedDirect','balance','date','bankImported'].includes(k)))))deny('import-account-coverage','נדרשים דיווחים מלאים ומפורשים לכל חשבונות המקור בכל חודש.');
 const receiptRows=(source.reportInbox?.receipts??[]).filter(r=>r.target===accountId),bindingRows=(source.reportInbox?.bindings??[]).filter(r=>r.target===accountId);
 if(receiptRows.some(r=>!batchIds.has(r.reference)))deny('import-receipt','קבלת מקור אינה מצביעה על דוח של החשבון הנבחר.');
 const exact=reviewAccountMigration(source,target,{...options,sourceRevision:0,targetRevision:0}).imports;
 const blocking=exact.blockers.filter(b=>b.code!=='import-atomic-pending');for(const b of blocking)deny(b.code,b.message);
 const targetGuardKeys=new Set((target.importMigrationGuards?.movements??[]).map(e=>e.key)),targetGuardFingerprints=new Set((target.importMigrationGuards?.movements??[]).map(e=>e.fingerprint)),targetGuardFiles=new Set(target.importMigrationGuards?.receipts??[]);
 if(selected.some(e=>targetGuardKeys.has(e.key)||targetGuardFingerprints.has(e.fingerprint))||receiptRows.some(r=>targetGuardFiles.has(r.hash)))deny('retained-target-identity','ביעד כבר יש סימון מעבר של אותו מקור. אין להעתיק את המקור שוב או לעקוף את סימון הזהות.');
 if(batches.some(b=>b.months.some(h=>!source.cashPlanning?.months[h.month]?.[accountId])))deny('import-months','חודש ברישום הדוח חסר בפירוט החשבון. אין להשלים דיווחים אוטומטית.');
 const originalRows=migrationForecast(source),anchors=Object.entries(source.months).filter(([,r])=>r.cashReport);
 for(const [month,r]of anchors){const records=source.cashPlanning?.months[month]??{},accounts=source.cashPlanning?.accounts??[],dated=accounts.map(a=>records[a.id]),dates=new Set(dated.map(row=>row?.date));
  if(!accounts.length||r.cashReport.pending===true||dated.some(row=>row?.balance===undefined||!row.date||row.date.slice(0,7)!==month)||dates.size!==1||r.bankCoverage&&r.bankCoverage.date!==dated[0]?.date||cents(r.cashReport.balance)!==dated.reduce((sum,row)=>sum+cents(row?.balance??0),0)||cents(r.cashReport.net)!==cents(originalRows.find(row=>row.month===month)?.net??NaN))deny('import-balance-anchor','יתרת הסיכום אינה ניתנת לחלוקה מדויקת: נדרשות יתרות לכל החשבונות באותו תאריך והתאמה לתזרים המדווח. אין להסיק יתרות חסרות.');
 }
 if(reasons.length)return{eligible:false,reasons};
 const normalized=clone(source);delete normalized.bankImport;delete normalized.reportInbox;
 for(const r of Object.values(normalized.months)){delete r.bankCoverage;delete r.cashReport;}
 for(const records of Object.values(normalized.cashPlanning.months))for(const r of Object.values(records))delete r.bankImported;
 // Reviewed bank names are kept locally; no rule or original file label is shared.
 for(const a of normalized.cashPlanning.accounts)delete a.bankName;
 const prepared=prepareManualAccountMigration(normalized,target,options);if(!prepared.eligible)return prepared;
 let from=prepared.sourceAfter,to=prepared.targetAfter;
 // Restore exact assigned account reports. No other account's row enters target.
 for(const [month,records]of Object.entries(source.cashPlanning.months)){
  if(from.cashPlanning.months[month])for(const id of Object.keys(from.cashPlanning.months[month]))from.cashPlanning.months[month][id]=clone(records[id]);
  to.cashPlanning.months[month][accountId]=clone(records[accountId]);
  const coverage=source.months[month]?.bankCoverage;if(coverage&&coverage.accountId!==accountId&&from.months[month])from.months[month].bankCoverage=clone(coverage);
 }
 for(const a of from.cashPlanning.accounts){const original=source.cashPlanning.accounts.find(c=>c.id===a.id);if(original.bankName!==undefined)a.bankName=original.bankName;}
 const originalAccount=source.cashPlanning.accounts.find(c=>c.id===accountId);if(originalAccount.bankName!==undefined)to.cashPlanning.accounts[0].bankName=originalAccount.bankName;
 const remaining={version:1,accounts:bank.accounts.filter(a=>a.id!==accountId).map(clone),entries:bank.entries.filter(e=>e.accountId!==accountId).map(clone),batches:bank.batches.filter(b=>b.accountId!==accountId).map(b=>({...clone(b),migrationBaseline:true}))};
 if(remaining.accounts.length)from.bankImport=remaining;
 const safeAccount={id:accountId,label:originalAccount.label,rules:[],personal:false,...(selectedAccounts[0].bankName?{bankName:selectedAccounts[0].bankName}:{})};
 const safeBatches=batches.map(b=>({id:b.id,accountId,file:/\.pdf$/i.test(b.file)?'migrated-source.pdf':'migrated-source.csv',from:b.from,to:b.to,migrationBaseline:true,months:[...new Set(b.months.map(h=>h.month))].map(month=>{
  const record=source.cashPlanning.months[month]?.[accountId];
  if(!record)throw Error('Missing imported account month');
  return{month,before:null,after:{values:clone(record.values),actual:record.actual,includesPlannedCard:record.includesPlannedCard,includesPlannedDirect:record.includesPlannedDirect},beforeCash:null,afterCash:{[accountId]:clone(record)}};
 })}));
 to.bankImport={version:1,accounts:[safeAccount],entries:clone(selected),batches:safeBatches};
 // Preserve the complete original selected import history only in its source.
 from.retainedImportHistory??={version:1,records:[]};from.retainedImportHistory.records.push({bankImport:{version:1,accounts:clone(selectedAccounts),entries:clone(selected),batches:clone(batches)},reportInbox:{version:1,bindings:clone(bindingRows),receipts:clone(receiptRows)}});
 if(source.reportInbox)from.reportInbox={version:1,bindings:source.reportInbox.bindings.filter(r=>r.target!==accountId).map(clone),receipts:source.reportInbox.receipts.filter(r=>r.target!==accountId).map(clone)};
 to.reportInbox={version:1,bindings:[],receipts:clone(receiptRows)};
 from=addImportMigrationGuards(from,selected,receiptRows.map(r=>r.hash));to=addImportMigrationGuards(to,selected,receiptRows.map(r=>r.hash));
 // Split only reconciled end-of-month anchors; every payer balance is explicit.
 const unanchoredFrom=forecast(from,undefined,originalRows.length),unanchoredTo=forecast(to,undefined,originalRows.length);
 for(const [month]of anchors){const records=source.cashPlanning.months[month],selectedBalance=records[accountId].balance,remainingBalance=source.cashPlanning.accounts.filter(a=>a.id!==accountId).reduce((sum,a)=>sum+cents(records[a.id].balance),0);
  if(from.months[month])from.months[month].cashReport={balance:remainingBalance/100,net:unanchoredFrom.find(r=>r.month===month).net};
  to.months[month].cashReport={balance:selectedBalance,net:unanchoredTo.find(r=>r.month===month).net};
 }
 if(!validatePlan(from)||!validatePlan(to)||JSON.stringify(from).length>2000000||JSON.stringify(to).length>2000000)return{eligible:false,reasons:[{code:'import-result',message:'התוצאה גדולה מדי או שאינה נתמכת בחוזה המעבר. שום נתון לא שונה.'}]};
 // Recheck restored evidence against the original, not only the normalized split.
 const before=migrationForecast(source),length=before.length,afterFrom=forecast(from,undefined,length),afterTo=forecast(to,undefined,length);
 for(let i=0;i<length;i++)for(const field of ['income','incomingTransfers','outgoingTransfers','spending','saving','planned','net','balance'])if(cents(before[i][field]??0)!==cents(afterFrom[i][field]??0)+cents(afterTo[i][field]??0))return{eligible:false,reasons:[{code:'import-conservation',message:'חלוקת הדיווחים משנה את התחזית הכללית. נדרש בירור לפני מעבר.'}]};
 for(const a of source.cashPlanning.accounts){const left=cashAccountForecast(source,a.id,[],length),right=cashAccountForecast(a.id===accountId?to:from,a.id,[],length);if(left.some((r,i)=>['net','balance'].some(k=>r[k]!==right[i][k])))return{eligible:false,reasons:[{code:'import-account-projection',message:'חלוקת מקורות הבנק משנה את תחזית אחד החשבונות. אין מעבר לפני בירור.'}]};}
 prepared.manifest.comparisons=before.map((r,i)=>({month:r.month,sourceBeforeBalanceCents:cents(r.balance),sourceAfterBalanceCents:cents(afterFrom[i].balance),targetAfterBalanceCents:cents(afterTo[i].balance),sourceBeforeNetCents:cents(r.net),sourceAfterNetCents:cents(afterFrom[i].net),targetAfterNetCents:cents(afterTo[i].net),sourceBeforeActual:r.actual,sourceAfterActual:afterFrom[i].actual,targetAfterActual:afterTo[i].actual,flows:['income','incomingTransfers','outgoingTransfers','spending','saving','planned'].map(field=>({field,beforeCents:cents(r[field]??0),sourceAfterCents:cents(afterFrom[i][field]??0),targetBeforeCents:0,targetAfterCents:cents(afterTo[i][field]??0)}))}));
 prepared.sourceAfter=from;prepared.targetAfter=to;prepared.manifest.imported={movementCount:selected.length,receiptCount:receiptRows.length,batches:safeBatches.map(b=>({id:b.id,from:b.from,to:b.to,file:b.file})),sourceSnapshotsRetained:true,targetBaseline:true,sourceRef:spaceEntityKey(budgetSpaceScope(options.user,options.sourceId),'account',accountId),targetRef:spaceEntityKey(budgetSpaceScope(options.user,options.targetId),'account',accountId)};
 return prepared;
}
