import {clone,creditCards,cashAccountList,cashPlanningBase} from './budget.js';
import {bankIdentity,bankPreview,bankDefaultMonthModes,bankPlannedDirect,bankRememberedRules,applyBankImport} from './bank-import-model.js';
import {prepareCardStatement,statementMerchant,statementGroups,statementBatchGroups} from './card-statement-model.js';
import {inboxHash,applyReportInbox,inboxTarget,inboxCardLast4} from './report-inbox-model.js';

// Extracted from the original report inbox. Both interfaces use this one workflow.
// Only the supplied review state is updated; the saved financial plan is never mutated.
export function reportInboxBase(plan,ui){const next=clone(plan);if(ui.blank){next.startMonth=ui.startMonth;next.setupCompleted=true;}const usedAccounts=ui.newAccounts.filter(a=>ui.items.some(i=>!i.skip&&!i.error&&(i.target===a.id||i.payer===a.id))),usedCards=ui.newCards.filter(c=>ui.items.some(i=>!i.skip&&!i.error&&i.target===c.id));if(usedAccounts.length){next.cashPlanning=cashPlanningBase(next);next.cashPlanning.accounts.push(...clone(usedAccounts));}if(usedCards.length){next.creditCards=clone(creditCards(next));next.creditCards.push(...clone(usedCards));for(const c of usedCards)next.defaults[c.id]=0;}return next;}
export function inboxBankGroupKey(item,r){return JSON.stringify([item.target,statementMerchant(r.description),statementMerchant(r.beneficiary),r.amountCents<0?'out':'in']);}
export async function buildReportInbox(plan,ui,{month,today,classifier,activityAPI}){
 const inboxAccounts=ui=>[...cashAccountList(plan),...ui.newAccounts],inboxCards=ui=>[...creditCards(plan),...ui.newCards];
 if(ui.blank)ui.startMonth=[plan.startMonth,...ui.items.filter(i=>!i.skip&&!i.error).map(i=>(i.from??i.report?.dueDate??i.activityCycle??plan.startMonth).slice(0,7))].sort()[0];
 let working=reportInboxBase(plan,ui),banks=[],cards=[],receipts=[],bindings=[],issues=0,bankGroups=new Map();ui.cardGroups=[];ui.skipped=ui.duplicates;ui.readyRows=0;ui.base=working;
 for(const item of ui.items){
  item.preview=null;item.questions=[];item.warning='';item.already=false;
  if(item.skip){ui.skipped++;continue;}
  if(item.activity){item.report=null;try{item.report=activityAPI.calActivityReport(item.activity,item.activityCycle,item.activityTotal,item.activityConfirmed);item.activityError='';}catch(error){item.activityError=error.message;}}
  if(item.error||['ambiguous','sheets'].includes(item.kind)||!item.target){issues++;continue;}
  if(item.kind==='bank'){
   const account=cashAccountList(working).find(a=>a.id===item.target);if(!account){issues++;continue;}if(item.provider&&account.bankName&&item.provider!==account.bankName){item.warning='הדוח זוהה מבנק אחר. בחרו את החשבון המתאים.';issues++;continue;}
   if(ui.newAccounts.some(a=>a.id===item.target&&!a.bankName)){item.warning='בחרו את הבנק של החשבון החדש.';issues++;continue;}
   const stored=working.bankImport?.accounts.find(a=>a.id===item.target),rules=stored?.rules??[];
   let records=await Promise.all(item.records.map(r=>bankIdentity(r,item.target))),choices={};
   for(const r of records){const key=inboxBankGroupKey(item,r),selected=ui.bankChoices.get(key),suggested=classifier.suggest(r,rules),personalRule=/מוטב שהגדרת|כלל אישי שהגדרת/.test(suggested.reason),auto=['clear','explicit'].includes(suggested.strength)&&(!personalRule||stored?.personal===true)&&!r.reversal;
    choices[r.line]=selected?{...selected,reviewed:true,manual:true}:{field:suggested.destination,reviewed:auto,refund:suggested.refund===true,reason:suggested.reason};
   }
   const options={id:item.id,accountId:item.target,label:account.label,bankName:(account.bankName??item.provider)||undefined,personal:stored?.personal===true,rules,from:item.from,to:item.to,fileName:item.name,choices,modes:{},reportScope:item.bankOptions.scope,directIncluded:item.directIncluded,asOf:month,coverageConfirmed:true,monthsConfirmed:true};
   let preview=bankPreview(working,records,options);
   if(preview.rows.some(r=>r.state==='migrated'))item.warning='בדוח יש מקור שסומן במעבר חשבון. קליטתו מחדש חסומה גם אם נבחר חשבון אחר; יש לבדוק את המקור לפני קליטה.';
   for(const row of preview.rows.filter(r=>r.state==='conflict')){
    const decision=item.decisions[row.line],previous=working.bankImport?.entries.find(e=>e.key===row.key);
    if(decision==='same'&&previous?.fingerprint===row.fingerprint)records=records.map(r=>r.line===row.line?{...r,missingReference:false}:r);
    else if(decision==='new')records=await Promise.all(records.map(async r=>r.line===row.line?{...r,key:await inboxHash(item.hash+':'+r.line+':'+r.key),missingReference:false}:r));
    else item.questions.push({type:'duplicate',row,canMatch:previous?.fingerprint===row.fingerprint,previous});
   }
   preview=bankPreview(working,records,options);options.modes=bankDefaultMonthModes(working,preview,month,options.reportScope);
   for(const m of preview.months){if(item.monthDecisions[m.month]==='skip')options.modes[m.month]='skip';if(options.modes[m.month]==='skip'&&m.newCount&&item.monthDecisions[m.month]!=='skip')item.questions.push({type:'protected-month',month:m.month});if(options.modes[m.month]!=='skip'&&bankPlannedDirect(working,m.month,item.target).length&&typeof item.directIncluded[m.month]!=='boolean')item.questions.push({type:'direct',month:m.month});}
   preview=bankPreview(working,records,options);item.preview=preview;
   for(const r of preview.rows.filter(r=>r.state==='new'&&!r.reviewed&&options.modes[r.date?.slice(0,7)]!=='skip')){const key=inboxBankGroupKey(item,r);if(!bankGroups.has(key))bankGroups.set(key,{key,merchant:[r.description,r.beneficiary].filter(Boolean).join(' · '),rows:[],category:choices[r.line]?.field??'',reason:choices[r.line]?.reason??''});bankGroups.get(key).rows.push({...r,fileName:item.name});}
   if(preview.rows.some(r=>r.state==='invalid'))item.questions.push({type:'invalid'});
   const selected=preview.months.filter(m=>options.modes[m.month]!=='skip');
   if(!selected.length&&!preview.rows.some(r=>r.state==='new'||r.state==='conflict'||r.state==='invalid')){item.already=true;ui.skipped++;receipts.push({hash:item.hash,kind:'bank',target:item.target,reference:item.id});continue;}
   if(!selected.length&&!item.questions.length){item.warning='כל חודשי הדוח נשארים ללא שינוי. הדוח לא ייקלט. בדקו את טווח התאריכים או העלו דוח מלא.';issues++;continue;}
   const pending=preview.rows.some(r=>selected.some(m=>m.month===r.date?.slice(0,7))&&!r.reviewed)||item.questions.length;
   if(pending){issues+=item.questions.length;continue;}
   if(banks.some(b=>b.options.accountId===item.target&&b.options.from<=item.to&&b.options.to>=item.from)){item.warning='שני דוחות לאותו חשבון מכסים תקופות חופפות וכוללים נתונים חדשים. השאירו רק את הדוח המלא והמעודכן; לא נבחר עבורכם איזה דוח להחליף.';issues++;continue;}
   try{options.rules=bankRememberedRules(rules,records,choices,true);working=applyBankImport(working,records,options);banks.push({records,options});ui.readyRows+=preview.rows.filter(r=>r.state==='new'&&selected.some(m=>r.date?.startsWith(m.month))).length;if(preview.months.every(m=>!m.newCount||options.modes[m.month]!=='skip'))receipts.push({hash:item.hash,kind:'bank',target:item.target,reference:item.id});}catch(error){item.warning=error.message;issues++;}
  }else if(item.kind==='card'){
   if(!item.payer||!item.report?.dueDate){issues++;continue;}if(!inboxAccounts(ui).some(a=>a.id===item.payer)){item.warning='יש לבחור חשבון משלם קיים.';issues++;continue;}
   const receiptHash=item.activity?await inboxHash(item.hash+':cal-cycle:'+item.report.dueDate):item.hash;
   try{const preview=item.report.entries?await prepareCardStatement(working,item.report,item.target,ui.merchantRules??[]):null;item.preview=preview;const previous=cards.find(c=>c.cardId===item.target&&c.dueDate===item.report.dueDate);if(previous){const same=previous.amount===item.report.amount&&JSON.stringify(previous.statement?.rows.map(r=>r.id).sort()??[])===JSON.stringify(preview?.rows.map(r=>r.id).sort()??[]);if(same){item.already=true;ui.skipped++;receipts.push({hash:receiptHash,kind:'card',target:item.target,reference:item.report.dueDate});continue;}item.warning='שני דוחות שונים לאותו כרטיס ומועד חיוב. הסירו את הישן והשאירו את הדוח המעודכן.';issues++;continue;}if(!preview){cards.push({cardId:item.target,dueDate:item.report.dueDate,amount:item.report.amount,accountId:item.payer,statement:null,item});receipts.push({hash:receiptHash,kind:'card',target:item.target,reference:item.report.dueDate});continue;}
    if(preview.rows.every(r=>r.existing)&&working.cardBilling?.reports.some(r=>r.cardId===item.target&&r.dueDate===preview.dueDate&&r.amount===preview.amount)){item.already=true;ui.skipped++;receipts.push({hash:receiptHash,kind:'card',target:item.target,reference:preview.dueDate});continue;}
    const groups=statementGroups(preview);for(const g of groups){const key=statementMerchant(g.merchant),selected=ui.categoryChoices.get(key);if(selected)for(const r of g.rows)r.category=selected;}
    for(const r of preview.rows)if(r.candidates.length&&!item.decisions[r.id]){issues++;item.questions.push({type:'card-match',row:r});}
    cards.push({cardId:item.target,dueDate:preview.dueDate,amount:preview.amount,accountId:item.payer,statement:preview,item});receipts.push({hash:receiptHash,kind:'card',target:item.target,reference:preview.dueDate});ui.readyRows+=preview.rows.filter(r=>!r.existing).length;
   }catch(error){item.warning=error.message;issues++;}
  }
  if(item.identityKey)bindings.push({key:item.identityKey,kind:item.kind,target:item.target});
 }
 ui.bankGroups=[...bankGroups.values()];issues+=ui.bankGroups.length;
 const grouped=statementBatchGroups(cards.map(c=>({statement:c.statement,name:c.item.name,cardId:c.cardId,cardName:inboxCards(ui).find(card=>card.id===c.cardId)?.name,dueDate:c.dueDate})));
 for(const g of grouped){const key=statementMerchant(g.merchant),selected=ui.categoryChoices.get(key);if(selected)g.category=selected;}
 ui.cardGroups=grouped;ui.cards=cards;ui.banks=banks;ui.issues=issues;
 for(const c of cards){c.deferCategories=true;c.choices={};for(const row of c.statement?.rows??[]){if(row.existing)continue;const group=grouped.find(g=>g.rows.some(r=>r.id===row.id&&r.fileIndex===cards.indexOf(c)));c.choices[row.id]={category:group?.category??'',match:c.item.decisions[row.id]};}}
 ui.build=null;
 if(!issues&&(banks.length+cards.length||receipts.length)){try{ui.build=await applyReportInbox(ui.base,banks,cards,receipts,bindings,today);}catch(error){ui.error=error.message;ui.issues++;}}
}

// Original version-1 group draft schema and next-revision witnesses.
export function reportInboxDraft(ui,parserBuild){const keys=['id','name','size','target','payer','decisions','directIncluded','monthDecisions','bankOptions','skip','hash','identityKey','kind','provider','identity','report','records','from','to','inspection','sheets','activity','activityCycle','activityTotal','activityConfirmed','error','reason','storedId','storedRevision','storedCommitted'];return{version:1,parserBuild,groupId:ui.groupId??=crypto.randomUUID(),items:ui.items.filter(item=>!item.storedDuplicate).map(item=>Object.fromEntries(keys.filter(k=>item[k]!==undefined).map(k=>[k,item[k]]))),categoryChoices:[...ui.categoryChoices],bankChoices:[...ui.bankChoices],newAccounts:ui.newAccounts,newCards:ui.newCards,startMonth:ui.startMonth};}
export function reportInboxDraftForWrite(ui,items,parserBuild){const draft=reportInboxDraft(ui,parserBuild),ids=new Set(items.map(i=>i.storedId));for(const item of draft.items)if(ids.has(item.storedId))item.storedRevision++;return draft;}

export function reportInboxPayer(p,id){const mapped=p.cashPlanning?.cardAccounts[id];if(mapped)return mapped;const old=[...new Set((p.cardBilling?.reports??[]).filter(r=>r.cardId===id).map(r=>r.accountId))];return old.length===1?old[0]:cashAccountList(p).length===1?cashAccountList(p)[0].id:'';}
/** @param {any} reader */
export async function changeReportInbox(plan,ui,e,reader=null){
 const inboxBase=ui=>reportInboxBase(plan,ui),inboxAccounts=ui=>[...cashAccountList(plan),...ui.newAccounts],inboxCards=ui=>[...creditCards(plan),...ui.newCards],inboxPayer=reportInboxPayer;
  if(e.dataset.inboxCategory!==undefined)ui.categoryChoices.set(e.dataset.inboxCategory,e.value);
  if(e.dataset.inboxBankGroup!==undefined){const g=ui.bankGroups[Number(e.dataset.inboxBankGroup)];if(e.value)ui.bankChoices.set(g.key,{field:e.value,refund:g.rows[0].amountCents>0&&!['salary','otherIncome','incomingTransfers','outgoingTransfers','exclude'].includes(e.value)});}
  const keys=['provider','target','payer','date','from','to','scope','direct','duplicate','kind','sheet','label','cycle','cycleTotal','cycleConfirmed'],key=keys.find(k=>e.dataset['inbox'+k[0].toUpperCase()+k.slice(1)]!==undefined);
  if(key){const index=Number(e.dataset['inbox'+key[0].toUpperCase()+key.slice(1)]),item=ui.items[index];
   if(key==='cycle'){item.activityCycle=e.value;item.activityTotal='';item.activityConfirmed=false;item.decisions={};}
   if(key==='cycleTotal'){item.activityTotal=e.value;item.activityConfirmed=false;}
   if(key==='cycleConfirmed')item.activityConfirmed=e.checked===true;
   if(key==='target'){
    item.target=e.value;item.decisions={};
    if(e.value==='new'){if(item.kind==='bank'){const a={id:'bank_'+crypto.randomUUID(),label:({'one-zero':'וואן זירו',hapoalim:'הפועלים'}[item.provider]??'חשבון בנק')+' חדש',bankName:item.provider||undefined,buffer:0};ui.newAccounts.push(a);item.target=a.id;}else{const c={id:'card_'+crypto.randomUUID(),name:'כרטיס '+(item.identity?.slice(-4)??'חדש'),alias:inboxCardLast4(item)&&!inboxCards(ui).some(c=>c.alias===inboxCardLast4(item))?inboxCardLast4(item):'',billingDay:15};ui.newCards.push(c);item.target=c.id;}}
    item.payer=inboxPayer(inboxBase(ui),item.target);
    if(item.identityKey)for(const other of ui.items)if(other!==item&&!other.target&&other.identityKey===item.identityKey&&other.kind===item.kind){other.target=item.target;other.payer=item.payer;}
   }
   if(key==='provider'){const a=ui.newAccounts.find(a=>a.id===item.target);if(a)a.bankName=e.value;}
   if(key==='payer'){item.payer=e.value;if(e.value==='new'){const a={id:'bank_'+crypto.randomUUID(),label:'חשבון משלם חדש',buffer:0};ui.newAccounts.push(a);item.payer=a.id;}}
   if(key==='date')item.report.dueDate=e.value;
   if(key==='from'||key==='to'){if(!item.inspection?.pdfReconciliation)item[key]=e.value;}
   if(key==='scope')item.bankOptions.scope=e.value;
   if(key==='direct')item.directIncluded[e.dataset.month]=e.value==='included';
   if(key==='duplicate')item.decisions[e.dataset.row]=e.value;
   if(key==='label'){const a=ui.newAccounts.find(a=>a.id===item.target),c=ui.newCards.find(c=>c.id===item.target);if(a)a.label=e.value.trim();if(c)c.name=e.value.trim();}
   if(key==='kind'){if(e.value==='card'){const total=item.records.reduce((n,r)=>n-r.amountCents,0)/100;if(item.records.some(r=>!r.valid||r.currency!=='ILS')||total<0)throw Error('לא זוהה סיכום חיובי כרטיס ברור. בחרו דוח כרטיס נתמך.');item.report={amount:total,dueDate:''};}item.kind=e.value;item.target=inboxTarget(inboxBase(ui),item);item.payer=inboxPayer(inboxBase(ui),item.target);}
   if(key==='sheet'){const {inspectIntake}=reader;Object.assign(item,inspectIntake([item.sheets[Number(e.value)]]));item.identityKey=item.identity?await inboxHash(item.identity):'';item.target=inboxTarget(inboxBase(ui),item);item.payer=inboxPayer(inboxBase(ui),item.target);}
  }
}
