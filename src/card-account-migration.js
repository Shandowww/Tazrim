import {clone,validatePlan,budgetFields,cents,forecast,cashAccountForecast,indexMonth} from './budget.js';
import {budgetSpaceScope,spaceEntityKey} from './space-model.js';
const cardField=id=>/^card(?:[12]|_[a-zA-Z0-9-]{1,70})$/.test(id);
// Explicit configuration/payer maps only. Statement/evidence/import paths are
// deliberately left to their separate reviewed migration contracts.
export function prepareCardAccountMigration(source,target,options,splitManual){
 const reasons=[],deny=(code,message)=>{if(!reasons.some(r=>r.code===code))reasons.push({code,message});},cards=source.creditCards,accounts=source.cashPlanning?.accounts??[],accountIds=new Set(accounts.map(a=>a.id)),mapping=source.cashPlanning?.cardAccounts??{},accountId=options.accountId;
 if(!Array.isArray(cards))return{eligible:false,reasons:[{code:'card-config',message:'נדרשת רשימת כרטיסים שמורה ומפורשת; אין לשייך את כרטיסי ברירת המחדל או חשבון יחיד אוטומטית.'}]};
 if(!accountIds.has(accountId))return{eligible:false,reasons:[{code:'card-account',message:'נדרש חשבון משלם ידני מוגדר שנבחר במפורש.'}]};
 if((target.creditCards?.length??0)||Object.keys(target.cashPlanning?.cardAccounts??{}).length)deny('target-cards','ליעד כבר יש כרטיסים או שיוכים שמורים. אין לדרוס אותם.');
 if(source.bankImport||source.cardBilling||source.reportInbox||source.bankDetailLinks||source.sourceAllocations||source.savingsGoals)deny('card-evidence','דוחות, פירוט חיובים, קישורי ראיות וחסכון דורשים מסלול כרטיס נוסף.');
 const cardIds=new Set(cards.map(c=>c.id));
 for(const c of cards){if(Object.keys(c).some(k=>!['id','name','alias','billingDay','removedFrom'].includes(k)))deny('card-metadata','לכרטיס יש פרטים נוספים שלא נכללו בסקירה. אין להעתיק אותם אוטומטית.');if(!accountIds.has(mapping[c.id]))deny('card-payer','לכל כרטיס נדרש חשבון משלם מפורש ותקין, גם כשיש חשבון יחיד.');}
 const vectors=[source.defaults,...Object.values(source.months).map(r=>r.values),...accounts.map(a=>a.defaults),...Object.values(source.cashPlanning?.months??{}).flatMap(rows=>Object.values(rows).map(r=>r.values))];
 if(vectors.some(v=>v&&Object.entries(v).some(([key,n])=>cardField(key)&&n!==0&&!cardIds.has(key))))deny('unconfigured-card','יש סכומי כרטיס ללא תצורת זהות ושיוך שמורים. נדרשת סקירה מפורשת.');
 for(const c of cards){const payer=mapping[c.id];if(cents(source.defaults[c.id]??0)!==accounts.reduce((sum,a)=>sum+cents(a.defaults?.[c.id]??0),0)||accounts.some(a=>a.id!==payer&&cents(a.defaults?.[c.id]??0)!==0))deny('card-defaults','הערכות הכרטיס אינן תואמות בדיוק לחשבון המשלם שהוגדר.');for(const [month,record]of Object.entries(source.months)){const rows=source.cashPlanning?.months[month]??{};if(cents(record.values[c.id]??0)!==accounts.reduce((sum,a)=>sum+cents(rows[a.id]?.values[c.id]??0),0)||accounts.some(a=>a.id!==payer&&cents(rows[a.id]?.values[c.id]??0)!==0))deny('card-month','חיוב כרטיס מופיע בחשבון אחר או אינו תואם לסיכום החודש. אין שיוך לפי שם.');}}
 for(const e of source.expenses)if(e.source==='card'){
  if(!e.cardId||!cardIds.has(e.cardId)||!accountIds.has(mapping[e.cardId])||e.cashAccountId!==undefined&&e.cashAccountId!==mapping[e.cardId]||e.kind!=='expense')deny('card-commitment','להתחייבות בכרטיס נדרשים מזהה כרטיס ושיוך משלם תואם. הכנסה מתוכננת או סתירה דורשות סקירה נפרדת.');
  if(Object.keys(e).some(k=>!['id','name','amount','fees','firstMonth','payments','source','kind','cashAccountId','cardId'].includes(k)))deny('card-commitment-metadata','להתחייבות בכרטיס יש פרטים או ראיות נוספים שלא נכללו במסלול.');
 }
 if((source.details??[]).some(d=>cardField(d.method)||d.statement!==undefined))deny('card-details','פירוט כרטיס או מסמך חיוב אינו מועתק במסלול הידני.');
 if(reasons.length)return{eligible:false,reasons};
 const moved=cards.filter(c=>mapping[c.id]===accountId),remaining=cards.filter(c=>mapping[c.id]!==accountId),masked=clone(source),blank=clone(target);
 delete masked.creditCards;delete blank.creditCards;masked.cashPlanning.cardAccounts={};
 const strip=v=>{if(v)for(const key of Object.keys(v))if(cardField(key)){if(['card1','card2'].includes(key))v[key]=0;else delete v[key];}};
 for(const v of [masked.defaults,...Object.values(masked.months).map(r=>r.values),...masked.cashPlanning.accounts.map(a=>a.defaults),...Object.values(masked.cashPlanning.months).flatMap(rows=>Object.values(rows).map(r=>r.values))])strip(v);
 masked.expenses=source.expenses.map(e=>{const item=clone(e);if(item.source==='card'){item.source='direct';item.cashAccountId=mapping[e.cardId];delete item.cardId;}return item;});
 const result=splitManual(masked,blank,options);if(!result.eligible)return result;
 const from=result.sourceAfter,to=result.targetAfter;
 from.creditCards=clone(remaining);to.creditCards=clone(moved);from.cashPlanning.cardAccounts=Object.fromEntries(remaining.map(c=>[c.id,mapping[c.id]]));to.cashPlanning.cardAccounts=Object.fromEntries(moved.map(c=>[c.id,mapping[c.id]]));
 const payer=e=>e.source==='card'?mapping[e.cardId]:e.cashAccountId;from.expenses=source.expenses.filter(e=>payer(e)!==accountId).map(clone);to.expenses=source.expenses.filter(e=>payer(e)===accountId).map(clone);
 const restore=(v,original,ids)=>{for(const id of ids)if(Object.hasOwn(original??{},id))v[id]=original[id];};
 for(const [p,list]of [[from,remaining],[to,moved]]){
  const ids=list.map(c=>c.id);restore(p.defaults,source.defaults,ids);for(const a of p.cashPlanning.accounts){const original=accounts.find(row=>row.id===a.id);if(original.defaults)restore(a.defaults,original.defaults,ids);}
  for(const [month,rows]of Object.entries(p.cashPlanning.months)){restore(p.months[month].values,source.months[month].values,ids);for(const [id,r]of Object.entries(rows))restore(r.values,source.cashPlanning.months[month][id].values,ids);}
 }
 const old=source.cardMigrationGuards?.cards??[];from.cardMigrationGuards={version:1,cards:[...new Set([...old,...moved.map(c=>c.id)])]};
 if(!validatePlan(from)||!validatePlan(to))return{eligible:false,reasons:[{code:'card-result',message:'תוצאת מעבר הכרטיסים אינה נתמכת. שום נתון לא שונה.'}]};
 const length=Math.max(forecast(source).length,...Object.keys(source.months).map(month=>indexMonth(month)-indexMonth(source.startMonth)+1)),before=forecast(source,undefined,length),left=forecast(from,undefined,length),right=forecast(to,undefined,length);
 for(let i=0;i<length;i++)for(const key of ['income','incomingTransfers','outgoingTransfers','spending','saving','planned','net','balance'])if(cents(before[i][key]??0)!==cents(left[i][key]??0)+cents(right[i][key]??0))return{eligible:false,reasons:[{code:'card-conservation',message:'מעבר הכרטיסים משנה את התזרים. יש לברר את שיוכי התשלומים לפני מעבר.'}]};
 for(const a of accounts){const old=cashAccountForecast(source,a.id,[],length),next=cashAccountForecast(a.id===accountId?to:from,a.id,[],length);if(old.some((r,i)=>['balance','net'].some(key=>r[key]!==next[i][key])))return{eligible:false,reasons:[{code:'card-account-conservation',message:'מעבר הכרטיס משנה תחזית של חשבון משלם. אין מעבר לפני בירור.'}]};}
 const scope=budgetSpaceScope(options.user,options.sourceId),destination=budgetSpaceScope(options.user,options.targetId);
 result.manifest.cards=moved.map(c=>({...clone(c),payerAccountId:accountId,sourceRef:spaceEntityKey(scope,'card',c.id),targetRef:spaceEntityKey(destination,'card',c.id)}));
 result.manifest.commitments=to.expenses.map(e=>({id:e.id,name:e.name,kind:e.kind,sourceType:e.source,cardId:e.cardId??null,totalCents:cents(e.amount)+cents(e.fees),firstMonth:e.firstMonth,payments:e.payments,sourceRef:spaceEntityKey(scope,'expense',e.id),targetRef:spaceEntityKey(destination,'expense',e.id)}));
 result.manifest.defaultsCents=Object.fromEntries(budgetFields(to).map(([key])=>[key,cents(to.defaults[key]??0)]));
 result.manifest.comparisons=before.map((r,i)=>({month:r.month,sourceBeforeBalanceCents:cents(r.balance),sourceAfterBalanceCents:cents(left[i].balance),targetAfterBalanceCents:cents(right[i].balance),sourceBeforeNetCents:cents(r.net),sourceAfterNetCents:cents(left[i].net),targetAfterNetCents:cents(right[i].net),sourceBeforeActual:r.actual,sourceAfterActual:left[i].actual,targetAfterActual:right[i].actual,flows:['income','incomingTransfers','outgoingTransfers','spending','saving','planned'].map(field=>({field,beforeCents:cents(r[field]??0),sourceAfterCents:cents(left[i][field]??0),targetBeforeCents:0,targetAfterCents:cents(right[i][field]??0)}))}));
 return result;
}
