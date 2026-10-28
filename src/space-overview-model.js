import {isVault} from './vault.js';
import {validatePlan} from './budget.js';
import {transferLegs} from './transfer-matching-model.js';
import {cashAccountList,cashSourceRecords,cents,savingsBalances,savingsFundingAccounts} from './budget.js';
import {spaceEntityKey,budgetSpaceScope} from './space-model.js';

// Deliberately no total across spaces: ownership and transfer reconciliation are
// separate work. Keep only display summaries, never whole plans or source rows.
export function summarizeBudgetSpace(p, userId, budgetId, revision, asOf) {
 const scope=budgetSpaceScope(userId,budgetId),month=asOf.slice(0,7);
 const latest=readings=>readings.filter(r=>r.date&&r.date<=asOf&&Number.isFinite(r.balance)).sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
 const accounts=cashAccountList(p).map(account=>{
  const readings=Object.entries(cashSourceRecords(p,account.id)).filter(([m])=>m<=month).map(([,r])=>r);
  const openingDate=(account.openingMonth??p.startMonth)+'-01';
  const reading=latest(readings)??(account.opening!==undefined&&openingDate<=asOf?{balance:account.opening,date:openingDate,opening:true}:null);
  return {key:spaceEntityKey(scope,'account',account.id),id:account.id,name:account.label,
   balanceCents:reading?cents(reading.balance):null,date:reading?.date??null,opening:!!reading?.opening,fromBank:!!reading?.fromBank};
 });
 // A legacy aggregate belongs to the space, not to an inferred bank account.
 if(!accounts.length){
  const reading=latest(Object.entries(p.months).filter(([m])=>m<=month).map(([m,r])=>r.cashReport?{balance:r.cashReport.balance,date:r.bankCoverage?.date??m}:null).filter(Boolean));
  accounts.push({key:spaceEntityKey(scope,'legacy','cash'),id:null,name:'עו״ש ללא שיוך לחשבון',balanceCents:reading?cents(reading.balance):null,date:reading?.date??null,opening:false,fromBank:false});
 }
 const s=p.savingsGoals,hasSavings=!!s&&s.snapshotMonth<=month,pool=hasSavings?savingsBalances(p,month):null;
 const savings=pool?{balanceCents:cents(pool.balance),snapshotMonth:s.snapshotMonth,
  throughMonth:[s.snapshotMonth,...Object.keys(s.deposits??{}),...Object.keys(s.poolDeposits??{})].filter(m=>m<=month).sort().at(-1),
  goals:pool.items.map(g=>({key:spaceEntityKey(scope,'goal',g.id),id:g.id,name:g.name,currentCents:cents(g.current),targetCents:cents(g.target),fundingAccounts:savingsFundingAccounts(p,g).map(a=>({key:spaceEntityKey(scope,'account',a.id),name:a.label}))}))}:null;
 const transfers=transferLegs(p,userId,budgetId,revision,asOf);
 return {scope,revision,asOf,accounts,savings,transfers:transfers.slice(0,500),transferMatchingTruncated:transfers.length>500};
}

// A rejected/changed identity must never fall back to a cached financial value.
export function overviewLoadFailure(previous, status) {
 if([401,403,404].includes(status))return null;
 return previous?.summary?{...previous,status:'stale'}:null;
}

// Pure browsing over already-authorized summaries. Never infer sharing from names.
export function overviewGoalSelection(entries,spaceId='all',fundingKey=''){
 const spaces=[...entries.values()],selected=spaceId==='all'?spaces:spaces.filter(e=>e.meta.id===spaceId);
 const readable=selected.filter(e=>['ready','stale','loading'].includes(e.status));
 const accounts=readable.flatMap(e=>(e.summary?.accounts??[]).filter(a=>a.id!==null).map(a=>({key:a.key,name:a.name,spaceName:e.meta.name})));
 const goals=readable.flatMap(e=>(e.summary?.savings?.goals??[]).map(goal=>({goal,meta:e.meta,status:e.status,asOf:e.summary.asOf,snapshotMonth:e.summary.savings.snapshotMonth,throughMonth:e.summary.savings.throughMonth})));
 const rows=goals.filter(({goal})=>!fundingKey||(fundingKey==='unassigned'?!(goal.fundingAccounts?.length):goal.fundingAccounts?.some(a=>a.key===fundingKey)));
 return {spaces,selected,accounts,rows};
}

// The original per-space read projection; callers retain only summaries.
export function overviewBudgetEntry(meta,body,user,asOf,active,isEncrypted=isVault){
 if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Invalid revision');
 let source=body.plan,entry;const matchingLocked=isEncrypted(source);
 if(matchingLocked){const same=active&&meta.id===active.id&&active.loaded&&active.key&&!active.dirty&&active.revision===body.revision&&active.envelope?.keyId===source.keyId&&active.envelope?.context===source.context;if(!same){entry={meta,status:'locked',summary:null};source=null;}else source=active.plan;}
 if(!entry){if(source!==null&&!validatePlan(source))throw Error('Invalid plan');entry={meta,status:source===null?'empty':'ready',summary:source===null?null:summarizeBudgetSpace(source,user,meta.id,body.revision,asOf)};if(entry.summary&&matchingLocked){entry.summary.transfers=[];entry.summary.transferMatchingLocked=true;}}
 return{entry,source,matchingLocked};
}
