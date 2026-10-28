import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {zero,validatePlan} from '../src/budget.js';
import {summarizeBudgetSpace,overviewLoadFailure,overviewBudgetEntry} from '../src/space-overview-model.js';
import {visibleBudgetSpaces} from '../src/space-model.js';
const base=()=>({startMonth:'2026-01',opening:0,buffer:100,horizon:12,defaults:zero(),months:{},expenses:[],demo:false});
const cash=()=>({...base(),cashPlanning:{accounts:[{id:'same',label:'הפועלים',buffer:0,opening:100.15},{id:'missing',label:'טרם דווח',buffer:0}],months:{'2026-09':{same:{values:zero(),actual:true,includesPlannedCard:false,includesPlannedDirect:false,balance:-12.34,date:'2026-09-30'}},'2026-10':{same:{values:zero(),actual:true,includesPlannedCard:false,includesPlannedDirect:false,balance:999,date:'2026-10-31'}}},cardAccounts:{},transfers:[]}});
test('Overview preserves cents, uses dated reports, excludes future readings and never sums spaces',()=>{
 const p=cash(),before=JSON.stringify(p);assert.ok(validatePlan(p));
 const personal=summarizeBudgetSpace(p,'tal','personal',7,'2026-10-26');
 const shared=summarizeBudgetSpace(p,'tal','house',2,'2026-10-26');
 assert.equal(personal.accounts[0].balanceCents,-1234);assert.equal(personal.accounts[0].date,'2026-09-30');
 assert.equal(personal.accounts[1].balanceCents,null);assert.notEqual(personal.accounts[0].key,shared.accounts[0].key);
 assert.notEqual(personal.scope,summarizeBudgetSpace(p,'linoi','personal',1,'2026-10-26').scope);
 assert.equal(personal.revision,7);assert.equal(personal.savings,null);assert.equal(personal.total,undefined);
 assert.equal(personal.plan,undefined);assert.equal(JSON.stringify(p),before);
});
test('An opening balance is labeled and a future opening or missing legacy report remains unknown',()=>{
 const p=cash();p.cashPlanning.months={};let s=summarizeBudgetSpace(p,'tal','personal',1,'2026-10-26');
 assert.equal(s.accounts[0].opening,true);assert.equal(s.accounts[0].balanceCents,10015);
 p.cashPlanning.accounts[0].openingMonth='2026-11';s=summarizeBudgetSpace(p,'tal','personal',1,'2026-10-26');assert.equal(s.accounts[0].balanceCents,null);
 const legacy=base();legacy.opening=90000;assert.equal(summarizeBudgetSpace(legacy,'tal','personal',1,'2026-10-26').accounts[0].balanceCents,null);
 legacy.months['2026-09']={values:zero(),actual:true,includesPlannedCard:false,cashReport:{balance:42.05,net:0}};
 s=summarizeBudgetSpace(legacy,'tal','personal',1,'2026-10-26');assert.equal(s.accounts[0].balanceCents,4205);assert.equal(s.accounts[0].date,'2026-09');assert.equal(s.accounts[0].id,null);
});
test('Goals retain per-space keys and actual allocations without forecast deposits or returns',()=>{
 const p=base();p.savingsGoals={balance:200,snapshotMonth:'2026-01',items:[{id:'same',name:'חופשה',icon:'trophy',target:1000,allocated:50,monthly:999}],deposits:{'2026-02':{same:10.15},'2026-12':{same:500}}};
 p.months['2026-02']={values:{...zero(),personalSaving:10.15},actual:true,includesPlannedCard:false};p.months['2026-12']={values:{...zero(),personalSaving:500},actual:false,includesPlannedCard:false};
 assert.ok(validatePlan(p));const s=summarizeBudgetSpace(p,'tal','personal',1,'2026-10-26');
 assert.equal(s.savings.balanceCents,21015);assert.equal(s.savings.goals[0].currentCents,6015);assert.equal(s.savings.throughMonth,'2026-02');
 p.savingsGoals.snapshotMonth='2026-11';assert.equal(summarizeBudgetSpace(p,'tal','personal',1,'2026-10-26').savings,null);
});
test('Only network/server failure may retain a stale summary; denial drops it',()=>{
 const previous={meta:{id:'personal'},status:'ready',summary:{accounts:[]}};
 for(const status of [401,403,404])assert.equal(overviewLoadFailure(previous,status),null);
 assert.equal(overviewLoadFailure(previous,503).status,'stale');assert.equal(overviewLoadFailure(null,503),null);
});

function harness(){
 const shared='11111111-1111-4111-8111-111111111111',metas=[{id:'personal',name:'Private',role:'owner',hasData:true},{id:shared,name:'House',role:'viewer'}];
 const state={user:'tal',asOf:'2026-10-26',entries:new Map(),busy:false,error:'',controller:null};let draws=0,cleared=0;
 const c=vm.createContext({AbortController,setTimeout,clearTimeout,window:{addEventListener(){}},document:{getElementById:()=>null},accountId:'tal',activeBudget:'personal',spacesSessionChanged:false,spacePreference:{},budgets:metas,loaded:true,vaultKey:null,vaultEnvelope:null,dirty:false,revision:1,plan:cash(),validatePlan,isVault:p=>p?.format==='vault',summarizeBudgetSpace,overviewLoadFailure,overviewBudgetEntry:(meta,body,user,asOf,active)=>overviewBudgetEntry(meta,body,user,asOf,active,p=>p?.format==='vault'),visibleBudgetSpaces,render(){},spaceRequireReload(){c.spacesSessionChanged=true;},state});
 vm.runInContext(readFileSync('src/space-transfer-vaults-client.js','utf8'),c);
 vm.runInContext(readFileSync('src/space-overview-client.js','utf8'),c);
 vm.runInContext('spaceOverview=state',c);
 c.spaceOverviewRender=()=>draws++;
 c.clearSpaceOverview=()=>{cleared++;state.controller?.abort();vm.runInContext('spaceOverview=null',c);};
 c.spaceOverviewJSON=async url=>url==='/api/budgets'?{accountId:'tal',budgets:metas}:{accountId:'tal',revision:1,plan:cash()};
 return {c,state,shared,metas,cleared:()=>cleared,draws:()=>draws};
}
test('Overview loads only permitted spaces with bounded concurrency and no synthetic All plan',async()=>{
 const h=harness();let inFlight=0,peak=0;const paths=[];
 h.metas.push({id:'other',name:'Other',role:'owner'},{...h.metas[1]});
 h.c.spaceOverviewJSON=async url=>{
  paths.push(url);if(url==='/api/budgets')return{accountId:'tal',budgets:h.metas};
  inFlight++;peak=Math.max(peak,inFlight);await new Promise(resolve=>setTimeout(resolve,2));inFlight--;
  return {accountId:'tal',revision:1,plan:cash()};
 };
 await h.c.refreshSpaceOverview();assert.equal(peak,2);assert.equal(h.state.entries.size,3);assert.equal(paths.length,4);
 assert.ok(paths.every(p=>p==='/api/budgets'||p.startsWith('/api/plan?budget=')));assert.equal(h.c.activeBudget,'personal');assert.equal(h.c.revision,1);
 assert.equal(h.state.busy,false);assert.ok(h.state.entries.get('personal').summary);
});
test('Refresh preserves explicitly stale values on ordinary failure, but removes revoked entries',async()=>{
 const h=harness();await h.c.refreshSpaceOverview();
 h.c.spaceOverviewJSON=async url=>{if(url==='/api/budgets')return{accountId:'tal',budgets:h.metas};throw Object.assign(Error('offline'),{status:url.includes('personal')?503:404});};
 await h.c.refreshSpaceOverview();assert.equal(h.state.entries.get('personal').status,'stale');assert.equal(h.state.entries.has(h.shared),false);
 assert.match(h.state.error,/הגישה/);assert.equal(h.c.spacesSessionChanged,false);
 h.c.spaceOverviewJSON=async()=>{throw Error('offline');};await h.c.refreshSpaceOverview();assert.equal(h.state.entries.get('personal').status,'stale');
});
test('Authorization-list changes purge removed summaries before fetching remaining sources',async()=>{
 const h=harness();await h.c.refreshSpaceOverview();
 h.c.spaceOverviewJSON=async url=>{if(url==='/api/budgets')return{accountId:'tal',budgets:[h.metas[0]]};assert.equal(h.state.entries.has(h.shared),false);return{accountId:'tal',revision:1,plan:null};};
 await h.c.refreshSpaceOverview();assert.equal(h.state.entries.size,1);assert.equal(h.state.entries.get('personal').status,'empty');assert.equal(h.state.entries.get('personal').summary,null);
});
test('Changed identity, missing active membership and authentication failure clear all cached summaries',async()=>{
 for(const failure of ['identity-list','identity-plan','revoked-active','401','403']){
  const h=harness();await h.c.refreshSpaceOverview();
  h.c.spaceOverviewJSON=async url=>{
   if(failure==='401'||failure==='403')throw Object.assign(Error('denied'),{status:Number(failure)});
   if(url==='/api/budgets')return{accountId:failure==='identity-list'?'linoi':'tal',budgets:failure==='revoked-active'?[h.metas[1]]:h.metas};
   return{accountId:'linoi',revision:1,plan:cash()};
  };
  await h.c.refreshSpaceOverview();assert.ok(h.cleared());assert.equal(h.c.spacesSessionChanged,true);
 }
});
test('Encrypted scopes are locked unless the exact active revision is already unlocked in memory',async()=>{
 const h=harness(),vault={format:'vault',keyId:'key',context:'personal:tal'};
 h.c.spaceOverviewJSON=async url=>url==='/api/budgets'?{accountId:'tal',budgets:h.metas}:{accountId:'tal',revision:1,plan:vault};
 await h.c.refreshSpaceOverview();assert.equal(h.state.entries.get('personal').status,'locked');assert.equal(h.state.entries.get('personal').summary,null);
 h.c.vaultKey={};h.c.vaultEnvelope=vault;await h.c.refreshSpaceOverview();assert.equal(h.state.entries.get('personal').status,'ready');assert.equal(h.state.entries.get(h.shared).status,'locked');
 h.c.revision=2;await h.c.refreshSpaceOverview();assert.equal(h.state.entries.get('personal').status,'locked');assert.equal(h.state.entries.get('personal').summary,null);
});
test('Closed overview ignores late responses and never repopulates a new session',async()=>{
 const h=harness();let resolve;h.c.spaceOverviewJSON=()=>new Promise(r=>resolve=r);
 const pending=h.c.refreshSpaceOverview();h.c.clearSpaceOverview();resolve({accountId:'tal',budgets:h.metas});await pending;
 assert.equal(h.state.entries.size,0);assert.equal(vm.runInContext('spaceOverview',h.c),null);
});
