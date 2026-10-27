import {cents,validatePlan} from './budget.js';
import {budgetSpaceScope,spaceEntityKey} from './space-model.js';
const migrationSavingFields=['personalSaving','sharedSaving','personalInvest','sharedInvest'];

// A recorded snapshot and its dependent records, not a current valuation. Goal
// allocations describe the same pool and must never be added to asset balances.
function savingsOwnershipInventory(plan,scope){
 const s=plan.savingsGoals,assets=[],goals=[],issues=[];
 if(s){
  if(s.accounts){for(const a of s.accounts)assets.push({ref:spaceEntityKey(scope,'savings-account',a.id),id:a.id,name:a.name,amountCents:cents(a.balance),month:s.accountsMonth,date:s.accountsAsOf??null,kind:'recorded-asset',returnMode:a.returnMode??'none'});
   if(s.accountsAdjustment>0)assets.push({ref:spaceEntityKey(scope,'savings-unassigned','adjustment'),id:'adjustment',name:'תוספת למאגר ללא שיוך לנכס',amountCents:cents(s.accountsAdjustment),month:s.snapshotMonth,date:null,kind:'unassigned-adjustment',returnMode:'none'});
   if(s.accountsMonth!==s.snapshotMonth)issues.push({code:'asset-dates',message:'תאריך יתרות הנכסים שונה מתאריך המאגר. יש לעדכן את יתרות החסכון במרחב המקור לפני בדיקת חלוקה.'});
   if(s.accountsAdjustment!==0)issues.push({code:'asset-adjustment',message:'יש התאמה במאגר ללא שיוך לנכס. אין להסיק מאיזה נכס הגיעה או להפחית אותה מנכס שרירותי.'});
  }else assets.push({ref:spaceEntityKey(scope,'savings-pool','combined'),id:'combined',name:'מאגר חסכון משולב ללא פירוט נכסים',amountCents:cents(s.balance),month:s.snapshotMonth,date:null,kind:'combined-pool',returnMode:'none'});
  for(const g of s.items)goals.push({ref:spaceEntityKey(scope,'goal',g.id),id:g.id,name:g.name,allocatedCents:cents(g.allocated),targetCents:cents(g.target),plannedMonthlyCents:cents(g.monthly),deadline:g.deadline??null,fundingRefs:(g.fundingAccountIds??[]).map(id=>spaceEntityKey(scope,'account',id))});
  const known=new Set(['balance','snapshotMonth','items','deposits','accounts','accountsMonth','accountsAsOf','accountsAdjustment','accountsCovered','covered','poolDeposits','coveredPool']);
  if(Object.keys(s).some(k=>!known.has(k))||(s.accounts??[]).some(a=>Object.keys(a).some(k=>!['id','name','balance','returnMode'].includes(k)))||s.items.some(g=>Object.keys(g).some(k=>!['id','name','icon','target','allocated','monthly','deadline','fundingAccountIds'].includes(k))))issues.push({code:'savings-metadata',message:'יש פרטי חסכון נוספים הדורשים סקירה לפני מעבר; הם אינם מועתקים בסקירת הבעלות.'});
 }
 const historyRows=[];
 for(const [month,entries]of Object.entries(s?.deposits??{}))for(const [id,amount]of Object.entries(entries)){const amountCents=cents(amount),coveredCents=month<s.snapshotMonth?amountCents:month===s.snapshotMonth?cents(s.covered?.[id]??0):0;historyRows.push({ref:spaceEntityKey(scope,'savings-history',JSON.stringify(['goal',month,id])),id:JSON.stringify(['goal',month,id]),kind:'goal',month,goalId:id,name:s.items.find(g=>g.id===id)?.name??id,amountCents,coveredCents,includedInSnapshot:coveredCents===amountCents&&month<=s.snapshotMonth});}
 for(const [month,amount]of Object.entries(s?.poolDeposits??{})){const assigned=Object.values(s.deposits[month]??{}).reduce((sum,n)=>sum+cents(n),0),amountCents=cents(amount)-assigned,coveredCents=month<s.snapshotMonth?amountCents:month===s.snapshotMonth?cents(s.coveredPool??0):0;historyRows.push({ref:spaceEntityKey(scope,'savings-history',JSON.stringify(['pool',month])),id:JSON.stringify(['pool',month]),kind:'pool',month,name:'הפקדה ללא הקצאה למטרה',amountCents,coveredCents,includedInSnapshot:coveredCents===amountCents&&month<=s.snapshotMonth});}
 const allocations=Object.entries(s?.deposits??{}).flatMap(([month,values])=>Object.entries(values).map(([id,amount])=>({month,goalRef:spaceEntityKey(scope,'goal',id),amountCents:cents(amount),coveredCents:month===s.snapshotMonth?cents(s.covered?.[id]??0):0})));
 const poolDeposits=Object.entries(s?.poolDeposits??{}).map(([month,amount])=>({month,amountCents:cents(amount),coveredPoolCents:month===s.snapshotMonth?cents(s.coveredPool??0):0}));
 const contributions=Object.entries(plan.months).flatMap(([month,r])=>migrationSavingFields.filter(k=>r.values[k]).map(field=>({month,field,amountCents:cents(r.values[field]),actual:r.actual})));
 const defaults=migrationSavingFields.filter(k=>plan.defaults[k]).map(field=>({field,amountCents:cents(plan.defaults[field])}));
 const schedules=(plan.savingSchedules??[]).map(r=>({from:r.from,personalSavingCents:cents(r.personalSaving),sharedSavingCents:cents(r.sharedSaving)}));
 const requests=(plan.savingTransfers??[]).map(t=>({id:t.id,month:t.month,status:t.status,personalCents:cents(t.personal),sharedCents:cents(t.shared),payerRef:t.cashAccountId?spaceEntityKey(scope,'account',t.cashAccountId):null}));
 return {scope,present:!!s,coverage:{goals:Object.entries(s?.covered??{}).map(([id,amount])=>({goalRef:spaceEntityKey(scope,'goal',id),amountCents:cents(amount)})),poolCents:cents(s?.coveredPool??0),accountsCents:cents(s?.accountsCovered??0)},snapshotMonth:s?.snapshotMonth??null,balanceCents:s?cents(s.balance):null,allocatedCents:goals.reduce((sum,g)=>sum+g.allocatedCents,0),freeCents:s?cents(s.balance)-goals.reduce((sum,g)=>sum+g.allocatedCents,0):null,assetsAdjustmentCents:s?.accounts?cents(s.accountsAdjustment):0,assets,goals,historyRows,allocations,poolDeposits,contributions,defaults,schedules,requests,issues};
}
export function reviewSavingsOwnership(source,target,{user,sourceId,targetId,accountId,sourceRevision,targetRevision}){
 if(!validatePlan(source)||!validatePlan(target)||sourceId===targetId||!Number.isSafeInteger(sourceRevision)||sourceRevision<0||!Number.isSafeInteger(targetRevision)||targetRevision<0)throw Error('נדרשים שני מרחבים שמורים וגרסאות מדויקות לסקירת בעלות.');
 const sourceScope=budgetSpaceScope(user,sourceId),targetScope=budgetSpaceScope(user,targetId),from=savingsOwnershipInventory(source,sourceScope),to=savingsOwnershipInventory(target,targetScope);
 const targetAssets=new Set(to.assets.filter(a=>a.kind==='recorded-asset').map(a=>a.id)),targetGoals=new Set(to.goals.map(g=>g.id));
 const collisions=[...from.assets.filter(a=>a.kind==='recorded-asset'&&targetAssets.has(a.id)).map(a=>({kind:'asset',id:a.id,sourceRef:a.ref,targetRef:spaceEntityKey(targetScope,'savings-account',a.id)})),...from.goals.filter(g=>targetGoals.has(g.id)).map(g=>({kind:'goal',id:g.id,sourceRef:g.ref,targetRef:spaceEntityKey(targetScope,'goal',g.id)}))];
 return{version:1,context:JSON.stringify([sourceScope,targetScope,accountId,sourceRevision,targetRevision]),applyAvailable:false,ownershipInferred:false,from,to,collisions};
}
// Parse explicitly entered amounts. Never round, fill blanks or interpret an
// exponent/thousands separator as an ownership decision.
export function savingsOwnershipCents(value){
 if(typeof value!=='string'||!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value.trim()))return null;
 const [whole,fraction='']=value.trim().replace(',','.').split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(amount)&&amount<=10000000000?amount:null;
}
export function evaluateSavingsOwnership(review,proposal){
 const errors=[],deny=(code,message)=>{if(!errors.some(e=>e.code===code))errors.push({code,message});};
 if(!review||review.version!==1||review.applyAvailable!==false||!review.from?.present||!proposal||proposal.context!==review.context)return{valid:false,applyAvailable:false,errors:[{code:'context',message:'סקירת הבעלות אינה תואמת למקור, ליעד ולגרסאות שנבחרו. יש לרענן ולמלא מחדש.'}]};
 const totals={personalAssetsCents:0,sharedAssetsCents:0,personalGoalsCents:0,sharedGoalsCents:0};
 if(review.from.issues.some(i=>i.code==='asset-dates')||review.from.assetsAdjustmentCents<0)deny('asset-basis','אין בסיס תואם לחלוקת הנכסים: יש לעדכן תאריכים או לברר התאמה שלילית במאגר, בלי לנחש יתרות.');
 for(const [kind,rows,amountKey,totalKey]of [['assets',review.from.assets,'amountCents','Assets'],['goals',review.from.goals,'allocatedCents','Goals']]){
  const entries=proposal[kind];if(!Array.isArray(entries)||entries.length!==rows.length){deny('rows','יש לבדוק במפורש כל נכס וכל הקצאת מטרה, ללא השלמות אוטומטיות.');continue;}
  const wanted=new Map(rows.map(r=>[r.ref,r])),seen=new Set();
  for(const e of entries){const row=wanted.get(e?.ref);if(!row||seen.has(e.ref)||Object.keys(e).some(k=>!['ref','personalCents','sharedCents'].includes(k))){deny('identity','יש בחלוקה מזהה זר, כפול או פרטים לא נתמכים. אין למזג פריטים לפי שם.');continue;}seen.add(e.ref);
   if(!Number.isSafeInteger(e.personalCents)||!Number.isSafeInteger(e.sharedCents)||e.personalCents<0||e.sharedCents<0||e.personalCents>10000000000||e.sharedCents>10000000000){deny('amount','לכל צד נדרש סכום מפורש ותקין באגורות; שדה ריק אינו אפס.');continue;}
   if(e.personalCents+e.sharedCents!==row[amountKey])deny('sum','הסכומים האישיים והמשותפים חייבים להתאים בדיוק לסכום השמור בכל שורה.');
   totals['personal'+totalKey+'Cents']+=e.personalCents;totals['shared'+totalKey+'Cents']+=e.sharedCents;
  }
 }
 if(totals.personalAssetsCents+totals.sharedAssetsCents!==review.from.balanceCents)deny('pool','סכומי הבעלות על הנכסים אינם תואמים ליתרת המאגר השמורה. אין להוסיף אליה שוב הקצאות למטרות.');
 if(totals.personalGoalsCents>totals.personalAssetsCents||totals.sharedGoalsCents>totals.sharedAssetsCents)deny('allocation','הקצאות המטרות של כל צד אינן יכולות לעלות על חלקו בנכסים.');
 return {valid:errors.length===0,applyAvailable:false,context:review.context,errors,...(errors.length?{}:{totals:{...totals,personalFreeCents:totals.personalAssetsCents-totals.personalGoalsCents,sharedFreeCents:totals.sharedAssetsCents-totals.sharedGoalsCents}})};
}
