import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../src/space-model.js';

function harness({user='linoi',hasData=false,storage=new Map(),role='viewer'}={}){
 const c=vm.createContext({...model,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},app:{addEventListener(){}},document:{activeElement:null},
  accountId:'',accountEmail:'',loaded:true,loading:false,saving:false,securityBusy:false,vaultEnvelope:null,dirty:false,
  hasSecurityDraft:()=>false,hasScenarioDraft:()=>false,hasDetailDraft:()=>false,hasMonthlyInputDraft:()=>false,cardDraftOpen:false,
  itemDraft:{id:'',name:'',amount:0},plan:{startMonth:'2026-10'},zero:()=>({}),todayMonth:()=> '2026-10',
  render(){},notify(){},forgetVault(){c.forgot=true;},esc:String,tab:'progress',detailDraft:null,detailDirty:false,categoryGoalDirty:false,trendCategory:'',scenarioItems:[],purchaseEnabled:true,purchase:{},
  fetch:async()=>({ok:true,json:async()=>({accountId:user,accountEmail:user+'@example.test',budgets:[{id:'personal',role:'owner',hasData,name:'האישי שלי'},{id:'house',role,name:'הבית'}]})})});
 vm.runInContext(readFileSync('src/spaces.js','utf8'),c);
 c.load=async()=>{await c.loadBudgets();c.plan={startMonth:'2026-10',marker:'existing private data'};return true;};
 return{c,storage,run:code=>vm.runInContext(code,c)};
}
test('First-time shared viewer is offered private setup without changing a budget',async()=>{
 const {c,run,storage}=harness();await c.loadBudgets();assert.equal(run('activeBudget'),'house');
 assert.match(c.spaceChoiceView(),/להוסיף גם חשבון אישי/);assert.equal(storage.size,0);
 assert.equal(c.spaceAction('space-shared-only',{}),true);
 assert.equal(run('spaceChoice'),'');assert.equal(run('visibleBudgetSpaces(budgets,spacePreference).length'),1);
 assert.equal(JSON.parse(storage.get(model.spaceDeviceKey('linoi'))).personal,'later');
});
test('Personal setup later reuses personal space; a shared viewer becomes owner only in own personal space',async()=>{
 const {c,run}=harness();await c.loadBudgets();c.spaceAction('space-shared-only',{});
 await c.openPersonalSpace();assert.equal(run('activeBudget'),'personal');assert.equal(c.budgetMeta().role,'owner');
 assert.equal(c.plan.marker,'existing private data');assert.equal(run('spacePreference.personal'),'enabled');assert.equal(run('spaceChoice'),'');
});
test('Existing personal data stays visible and is not replaced by shared-only selection',async()=>{
 const {c,run}=harness({hasData:true});await c.loadBudgets();assert.equal(run('activeBudget'),'personal');
 run("activeBudget='house';spaceChoice='house'");const original=c.plan;c.spaceAction('space-shared-only',{});
 assert.equal(run('visibleBudgetSpaces(budgets,spacePreference).length'),2);assert.equal(c.plan,original);
});
test('Selection belongs to user, ignores legacy global selection, and survives a reload',async()=>{
 const storage=new Map([['monthly-flow-active-budget','someone-elses-budget']]);
 let h=harness({storage});await h.c.loadBudgets();h.c.spaceAction('space-shared-only',{});
 h=harness({storage});await h.c.loadBudgets();assert.equal(h.run('activeBudget'),'house');assert.equal(h.c.spaceChoiceView(),'');
 h=harness({storage,user:'tal',hasData:true});await h.c.loadBudgets();assert.equal(h.run('activeBudget'),'personal');
});
test('Open monthly/card drafts block switching; failed loads preserve prior space and preferences',async()=>{
 const {c,run}=harness();await c.loadBudgets();c.cardDraftOpen=true;
 assert.equal(await c.switchBudget('personal'),false);assert.equal(run('activeBudget'),'house');
 c.cardDraftOpen=false;c.hasMonthlyInputDraft=()=>true;assert.equal(await c.switchBudget('personal'),false);
 c.hasMonthlyInputDraft=()=>false;c.load=async()=>false;assert.equal(await c.switchBudget('personal'),false);
 assert.equal(run('activeBudget'),'house');assert.equal(run('spacePreference.personal'),undefined);
});
test('Identity change or revoked active space clears financial display and requires a fresh page',async()=>{
 for(const identityChange of [true,false]){
  const {c,run}=harness();await c.loadBudgets();
  c.fetch=async()=>({ok:true,json:async()=>({accountId:identityChange?'other':'linoi',budgets:[{id:'personal',hasData:false}]})});
  await assert.rejects(c.loadBudgets());assert.equal(run('spacesSessionChanged'),true);assert.equal(c.loaded,false);assert.equal(c.forgot,true);assert.equal(c.plan.opening,0);
 }
});
test('Storage unavailable does not block personal access or create financial writes',async()=>{
 const {c,run}=harness();c.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 await c.loadBudgets();await c.openPersonalSpace();assert.equal(run('activeBudget'),'personal');
});
test('Failed switch cannot restore a previous space whose membership was revoked during loading',async()=>{
 const {c,run}=harness();await c.loadBudgets();
 c.load=async()=>{run("budgets=[{id:'personal',role:'owner',hasData:false}]");return false;};
 assert.equal(await c.switchBudget('personal'),false);
 assert.equal(run('spacesSessionChanged'),true);assert.equal(c.loaded,false);assert.equal(c.plan.opening,0);
});
