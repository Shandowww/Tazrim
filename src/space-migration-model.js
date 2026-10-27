import {reviewSavingsOwnership} from './space-savings-model.js';
import {cashAccountList,cashSourceRecords,cashCardAccount,creditCards,monthlyValues,cents,budgetFields,validatePlan} from './budget.js';
import {budgetSpaceScope,spaceEntityKey} from './space-model.js';

// Review only. Never build a replacement plan or infer ownership from account names.
export function reviewAccountMigration(source,target,{user,sourceId,targetId,accountId,sourceRevision,targetRevision}){
 if(sourceId===targetId||!validatePlan(source)||!validatePlan(target))throw Error('בחרו שני מרחבים שונים עם נתונים תקינים.');
 const account=cashAccountList(source).find(a=>a.id===accountId);if(!account)throw Error('חשבון המקור אינו זמין.');
 const scope=budgetSpaceScope(user,sourceId),destination=budgetSpaceScope(user,targetId),issues=[];
 const add=(code,message,count=1)=>{if(count)issues.push({code,message,count});};
 const rules=(source.bankImport?.accounts??[]).find(a=>a.id===accountId)?.rules??[];
 const cards=creditCards(source).filter(c=>cashCardAccount(source,c.id)===accountId),cardIds=new Set(cards.map(c=>c.id));
 const owner=e=>e.cashAccountId??(e.cardId?cashCardAccount(source,e.cardId):null)??(cardIds.has(e.method)?accountId:null);
 const groups=[];
 const group=(kind,label,all,selected,id=e=>e.id,name=e=>e.name??e.label??'')=>{
  const items=all.filter(selected),ambiguous=all.filter(e=>!selected(e)&&!owner(e));
  groups.push({kind,label,count:items.length,examples:items.slice(0,5).map(e=>({ref:spaceEntityKey(scope,kind,String(id(e))),id:String(id(e)),label:String(name(e)).slice(0,240)}))});
  return {items,ambiguous};
 };
 group('account','חשבון המקור',[account],()=>true);
 group('card','כרטיסים משויכים',cards,()=>true);
 group('classification-rule','כללי סיווג לחשבון',rules,()=>true,e=>JSON.stringify([e.action??e.text,e.beneficiary??'',e.direction,e.destination]),e=>e.text);
 const entries=(source.bankImport?.entries??[]).filter(e=>e.accountId===accountId),keys=new Set(entries.map(e=>e.key));
 group('bank-movement','תנועות בנק מסווגות',entries,()=>true,e=>e.key,e=>[e.source?.description,e.source?.beneficiary].filter(Boolean).join(' · '));
 const batches=(source.bankImport?.batches??[]).filter(e=>e.accountId===accountId);
 group('import-batch','רישומי קליטת דוחות',batches,()=>true,e=>e.id,()=> 'נשארים במקור: עשויים לכלול צילום של הסיכום הכללי');
 const details=group('detail','פירוט הוצאות וצ׳קים',source.details??[],e=>owner(e)===accountId);
 const expenses=group('expense','התחייבויות מתוכננות',source.expenses,e=>owner(e)===accountId);
 const loans=group('loan','הלוואות',source.loans??[],e=>owner(e)===accountId);
 const saving=group('saving-transfer','בקשות הפקדה',source.savingTransfers??[],e=>owner(e)===accountId);
 const reports=(source.cardBilling?.reports??[]).filter(r=>r.accountId===accountId||cardIds.has(r.cardId));
 group('card-report','סיכומי דוחות כרטיס',reports,()=>true,e=>JSON.stringify([e.cardId,e.dueDate]),e=>e.dueDate);
 const receipts=(source.reportInbox?.receipts??[]).filter(e=>e.target===accountId||cardIds.has(e.target));
 group('receipt','קבלות קליטה',receipts,()=>true,e=>e.hash,()=> 'דורש שימור מניעת קליטה כפולה');
 const bindings=(source.reportInbox?.bindings??[]).filter(e=>e.target===accountId||cardIds.has(e.target));
 group('binding','שיוכי מקורות',bindings,()=>true,e=>e.key);
 const goals=(source.savingsGoals?.items??[]).filter(g=>g.fundingAccountIds?.includes(accountId));
 group('goal','מטרות עם קישור מימון',goals,()=>true);
 const transfers=(source.cashPlanning?.transfers??[]).filter(t=>t.from===accountId||t.to===accountId);
 group('account-transfer','העברות בין חשבונות במקור',transfers,()=>true,e=>e.id,e=>e.month);
 const allocations=(source.sourceAllocations??[]).filter(g=>g.bankParts?.some(p=>keys.has(p.key))||g.detailParts?.some(p=>details.items.some(e=>e.id===p.id)));
 group('source-allocation','קישורי ראיות וחלוקות',allocations,()=>true);
 const links=(source.bankDetailLinks??[]).filter(l=>keys.has(l.bankKey)||details.items.some(d=>d.id===l.detailId));
 group('detail-link','התאמות תנועה לפירוט',links,()=>true,l=>l.bankKey);
 const records=cashSourceRecords(source,accountId),fields=budgetFields(source).map(([id,label])=>({id,label}));
 const months=Object.entries(records).sort(([a],[b])=>a.localeCompare(b)).map(([month,r])=>{
  const original=monthlyValues(source,month),destinationValues=monthlyValues(target,month);
  const rows=fields.map(f=>({field:f.id,label:f.label,selectedCents:cents(r.values[f.id]??0),sourceBeforeCents:cents(original[f.id]??0),targetBeforeCents:cents(destinationValues[f.id]??0)}));
  return {month,actual:r.actual,sourceActual:!!source.months[month]?.actual,targetActual:!!target.months[month]?.actual,
   balanceCents:r.balance===undefined?null:cents(r.balance),date:r.date??null,
   fields:rows.filter(f=>f.selectedCents||f.sourceBeforeCents||f.targetBeforeCents).map(f=>({...f,sourceRemainderCents:f.sourceBeforeCents-f.selectedCents,targetHypotheticalCents:f.targetBeforeCents+f.selectedCents}))};
 });
 const allAccountRecords=cashAccountList(source).map(a=>cashSourceRecords(source,a.id));
 const unassignedMonths=Object.entries(source.months).filter(([month,r])=>fields.some(f=>cents(r.values[f.id]??0)!==allAccountRecords.reduce((n,records)=>n+cents(records[month]?.values[f.id]??0),0)));
 const conflictingCards=(source.cardBilling?.reports??[]).filter(r=>cardIds.has(r.cardId)&&r.accountId&&r.accountId!==accountId).length+(source.bankImport?.entries??[]).filter(e=>cardIds.has(e.field)&&e.accountId!==accountId).length;
 const targetIds={account:new Set(cashAccountList(target).map(a=>a.id)),card:new Set(creditCards(target).map(c=>c.id)),detail:new Set((target.details??[]).map(d=>d.id)),expense:new Set(target.expenses.map(e=>e.id)),loan:new Set((target.loans??[]).map(e=>e.id)),goal:new Set((target.savingsGoals?.items??[]).map(e=>e.id))};
 const selectedIds={account:[account],card:cards,detail:details.items,expense:expenses.items,loan:loans.items,goal:goals};
 const collisions=Object.entries(selectedIds).flatMap(([kind,items])=>items.filter(e=>targetIds[kind]?.has(e.id)).map(e=>({kind,id:e.id,sourceRef:spaceEntityKey(scope,kind,e.id),targetRef:spaceEntityKey(destination,kind,e.id)})));
 const existingKeys=new Set((target.bankImport?.entries??[]).map(e=>e.key)),sameKeys=entries.filter(e=>existingKeys.has(e.key));
 add('identity-collision','מזהים קיימים גם ביעד; אין למזג לפי שם או לדרוס פריטים. נדרשת מפת מעבר מפורשת.',collisions.length);
 add('duplicate-source','מפתחות תנועות המקור כבר מופיעים ביעד; יש לבדוק כפילות לפני מעבר.',sameKeys.length);
 add('unassigned-items','יש פריטים ללא שיוך יציב לחשבון; הם נשארים לסקירה ולא משויכים לפי מספר החשבונות.',details.ambiguous.length+expenses.ambiguous.length+loans.ambiguous.length+saving.ambiguous.length);
 add('unassigned-totals','יש סכומים בסיכום החודשי ללא התאמה מלאה לדיווחי החשבונות. לא משייכים את הפער אוטומטית.',unassignedMonths.length);
 add('conflicting-card-payer','מקורות הכרטיס מציינים חשבון אחר מהשיוך הנוכחי. יש לברר את החשבון המשלם לפני מעבר.',conflictingCards);
 add('combined-savings','יתרות חסכון, מטרות והקצאות משולבות דורשות חלוקת בעלות מפורשת. קישור מימון אינו בעלות.',source.savingsGoals?1:0);
 add('target-savings','גם ביעד קיים מאגר חסכון. יש לבדוק שאין נכס משותף שרשום כבר בשני המרחבים.',target.savingsGoals?1:0);
 add('cross-account-transfer','העברות בין חשבונות דורשות טיפול בשני הקצוות בלי לייצר כסף או לשתף חשבון פרטי.',transfers.length);
 add('private-snapshots','רישומי קליטה כוללים מצב תקציב קודם ואינם מועתקים בשלמותם ליעד.',batches.length);
 add('period-mismatch','למרחבים יש תחילת תקציב או אופק שונים; יש לסקור חודשים לפני שינוי.',source.startMonth!==target.startMonth||source.horizon!==target.horizon?1:0);
 add('aggregate-remainder','הפרדת רכיב החשבון משאירה ערכים שליליים בסיכום המקור; אין להחיל לפני בירור.',months.filter(m=>m.fields.some(f=>f.sourceRemainderCents<0)).length);
 add('account-capacity','היעד כבר כולל עשרה חשבונות בנק.',cashAccountList(target).length>=10?1:0);
 add('atomic-move-pending','סקירת התלות אינה תוכנית ביצוע. נדרשות בדיקת זכאות נפרדת ותוכנית מדויקת לפני אישור מעבר.');
 const known=new Set(['startMonth','opening','buffer','horizon','defaults','months','expenses','demo','setupCompleted','cashPlanning','creditCards','bankImport','details','loans','savingTransfers','savingsGoals','reportInbox','cardBilling','sourceAllocations','bankDetailLinks','savingSchedules','goals','displayName','accountColors','importMigrationGuards','retainedImportHistory','retainedSavingsHistory','savingsBaselineHistory','savingsMigrationGuards','cardMigrationGuards']);
 const otherFields=Object.keys(source).filter(k=>!known.has(k));
 add('other-budget-data','קיימים סוגי נתונים נוספים בתקציב; יש לסקור את קשריהם לפני מעבר.',otherFields.length);
 return {sourceScope:scope,targetScope:destination,sourceRevision,targetRevision,account:{id:account.id,name:account.label,openingCents:account.opening===undefined?null:cents(account.opening),openingMonth:account.openingMonth??source.startMonth},groups,months,collisions,issues,
  imports:reviewImportProvenance(source,target,{scope,destination,accountId}),
  savings:reviewSavingsOwnership(source,target,{user,sourceId,targetId,accountId,sourceRevision,targetRevision}),
  applyAvailable:false,financialChange:false,
  privacy:{labels:cards.map(c=>c.name).slice(0,10),descriptions:entries.filter(e=>e.source).slice(0,5).map(e=>[e.source.description,e.source.beneficiary].filter(Boolean).join(' · ').slice(0,240)),originalDocuments:'stay-private',history:'stay-private',connections:'stay-at-source',drafts:'stay-on-device'},
  retention:{importBatches:batches.length,allSavingsGoals:source.savingsGoals?.items.length??0,otherBudgetSections:otherFields.length}};
}

// A complete identity/privacy inventory, never a replacement budget or permission
// to skip a duplicate. In particular, batch snapshots must not enter this result.
function reviewImportProvenance(source,target,{scope,destination,accountId}){
 const bank=source.bankImport,other=target.bankImport,selected=(bank?.entries??[]).filter(e=>e.accountId===accountId);
 const batches=(bank?.batches??[]).filter(b=>b.accountId===accountId),batchMap=new Map((bank?.batches??[]).map(b=>[b.id,b]));
 const targetKeys=new Map((other?.entries??[]).map(e=>[e.key,e])),fingerprints=new Map(),sourceFingerprintCounts=new Map();
 for(const e of selected)sourceFingerprintCounts.set(e.fingerprint,(sourceFingerprintCounts.get(e.fingerprint)??0)+1);
 for(const e of other?.entries??[]){if(!fingerprints.has(e.fingerprint))fingerprints.set(e.fingerprint,[]);fingerprints.get(e.fingerprint).push(e);}
 const sourceFields=['line','parserVersion','date','valueDate','description','details','beneficiary','purpose','reference','currency','balanceCents'];
 const sourceView=e=>e.source?Object.fromEntries(sourceFields.map(k=>[k,e.source[k]??null])):null;
 const identity=e=>JSON.stringify([e.accountId,e.fingerprint,e.month,e.field,e.cents,e.bankCategoryId??null,sourceView(e)]);
 const movements=selected.map(e=>{
  const exact=targetKeys.get(e.key),overlap=fingerprints.get(e.fingerprint)??[],batch=batchMap.get(e.batchId),source=sourceView(e);
  const provenanceValid=!!source&&source.date.slice(0,7)===e.month&&batch?.accountId===accountId&&source.date>=batch.from&&source.date<=batch.to&&batch.months.some(h=>h.month===e.month);
  const state=exact?(identity(e)===identity(exact)?'same-source':'identity-conflict'):overlap.length?'possible-overlap':'not-found';
  return {key:e.key,fingerprint:e.fingerprint,sourceRef:spaceEntityKey(scope,'bank-movement',e.key),proposedTargetRef:spaceEntityKey(destination,'bank-movement',e.key),
   month:e.month,field:e.field,amountCents:e.cents,batchId:e.batchId,source,state,provenanceValid,referenceMissing:!source?.reference?.trim(),categoryMappingRequired:e.bankCategoryId!==undefined,
   sourceFingerprintCount:sourceFingerprintCounts.get(e.fingerprint),targetMatchCount:exact?1:overlap.length,targetExamples:(exact?[exact]:overlap).slice(0,5).map(t=>spaceEntityKey(destination,'bank-movement',t.key))};
 });
 const sourceReceipts=(source.reportInbox?.receipts??[]).filter(r=>r.kind==='bank'&&r.target===accountId),targetReceipts=target.reportInbox?.receipts??[],byHash=new Map(targetReceipts.map(r=>[r.hash,r]));
 const receipts=sourceReceipts.map(r=>{
  const prior=byHash.get(r.hash),batch=batchMap.get(r.reference),present=batch?.accountId===accountId;
  return {hash:r.hash,batchId:r.reference,sourceRef:spaceEntityKey(scope,'receipt',r.hash),proposedTargetRef:spaceEntityKey(destination,'receipt',r.hash),sourcePresent:present,
   state:prior?(prior.kind===r.kind&&prior.target===r.target&&prior.reference===r.reference?'same-receipt':'receipt-conflict'):targetReceipts.some(t=>t.kind==='bank'&&t.target===accountId&&t.reference===r.reference)?'possible-overlap':'not-found'};
 });
 const blockers=[],add=(code,message,count)=>{if(count)blockers.push({code,message,count});};
 const entryFields=new Set(['key','fingerprint','month','field','cents','batchId','accountId','source','bankCategoryId']);
 add('unreviewed-metadata','קיימים שדות מקור או קבלה נוספים שאינם כלולים בסקירה זו; אין להעתיק אותם ללא בירור.',selected.filter(e=>Object.keys(e).some(k=>!entryFields.has(k))||Object.keys(e.source??{}).some(k=>!sourceFields.includes(k))).length+sourceReceipts.filter(r=>Object.keys(r).some(k=>!['hash','kind','target','reference','proof'].includes(k))).length);
 add('movement-identity','מזהה תנועה קיים ביעד. אין לדלג, למזג או להחליף תנועה בלי פתרון מפורש.',movements.filter(e=>['same-source','identity-conflict'].includes(e.state)).length);
 add('movement-overlap','נמצאו טביעות מקור דומות עם מזהים אחרים. דמיון אינו הוכחת כפילות או שיוך לחשבון.',movements.filter(e=>e.state==='possible-overlap').length);
 add('source-overlap','יש תנועות נפרדות במקור עם אותה טביעת פרטים. אין לאחד אותן לפי תיאור או סכום.',movements.filter(e=>e.sourceFingerprintCount>1).length);
 add('source-unverified','חסרים פרטי מקור או שהקשר בין תנועה, חודש ודוח אינו תואם.',movements.filter(e=>!e.provenanceValid).length);
 add('weak-reference','תנועות ללא אסמכתה דורשות בירור נוסף, לרבות חפיפה בין פורמטי דוחות.',movements.filter(e=>e.referenceMissing).length);
 add('category-mapping','קטגוריות בנק הן מזהים מקומיים למרחב ודורשות מיפוי מפורש.',movements.filter(e=>e.categoryMappingRequired).length);
 add('receipt-identity','קבלה או אסמכתת דוח כבר קיימת ביעד. יש לשמר את מניעת הקליטה הכפולה בלי לדרוס קבלה.',receipts.filter(r=>r.state!=='not-found').length);
 add('receipt-unverified','קבלת קליטה אינה מצביעה על דוח קיים של החשבון הנבחר.',receipts.filter(r=>!r.sourcePresent).length);
 const batchReviews=batches.map(b=>({id:b.id,from:b.from,to:b.to,sourceRef:spaceEntityKey(scope,'import-batch',b.id),
  movementCount:selected.filter(e=>e.batchId===b.id).length,receiptCount:sourceReceipts.filter(r=>r.reference===b.id).length,
  targetIdPresent:(other?.batches??[]).some(t=>t.id===b.id),originalSnapshot:'stay-at-source'}));
 add('batch-identity','מזהה דוח קיים גם ביעד; נדרשת מפת זהות שאינה משכפלת את המקור.',batchReviews.filter(b=>b.targetIdPresent).length);
 add('unreceipted-batch','לדוח אין קבלת קליטה שמורה. אין לטעון שקיימת הגנה מלאה מייבוא חוזר של הקובץ.',batchReviews.filter(b=>!b.receiptCount).length);
 const count=movements.length+receipts.length+batches.length;
 add('import-atomic-pending','מעבר מיובא עדיין חסום: נדרשים רישומי זהות מצומצמים והגנה מייבוא חוזר בשני המרחבים, יחד עם שמירה אטומית. אין להעתיק את צילומי התקציב שבדוחות.',count?1:0);
 return {version:1,applyAvailable:false,movements,receipts,batches:batchReviews,blockers,
  retention:{originalSnapshots:'stay-at-source',originalDocuments:'stay-private',classificationRules:'stay-at-source',bindings:'stay-at-source',sourceReimportProtection:'required-before-apply',destinationReimportProtection:'required-before-apply'}};
}
