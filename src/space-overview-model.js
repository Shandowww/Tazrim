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
