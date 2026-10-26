import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {demoPlan,clone,forecast,validatePlan,indexMonth,defaultBudgetMonth,latestExpenseDataMonth} from '../src/budget.js';
const source=fs.readFileSync(new URL('../src/client.js',import.meta.url),'utf8');
function gesture(){
 const handlers={},indicator={hidden:true};let refreshes=0,prevented=0;
 const document={scrollingElement:{scrollTop:0},querySelector:()=>null,getElementById:()=>indicator,addEventListener:(k,fn)=>handlers[k]=fn};
 vm.runInNewContext(source.slice(source.indexOf('// Pull-down refresh:')),{document,window:{innerHeight:900},loading:false,saving:false,refreshBudget(){refreshes++;}});
 const touch=(y,x=100,target={closest:()=>null})=>({target,touches:[{clientY:y,clientX:x}],cancelable:true,preventDefault(){prevented++;}});
 return{handlers,document,indicator,touch,refreshes:()=>refreshes,prevented:()=>prevented};
}
test('Refresh needs a deliberate pull at the top; normal and horizontal scrolling are untouched',()=>{
 const f=gesture();f.handlers.touchstart(f.touch(400));f.handlers.touchmove(f.touch(550));f.handlers.touchend();assert.equal(f.refreshes(),0);assert.equal(f.prevented(),0);
 f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(160,220));f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(190));assert.equal(f.indicator.hidden,false);assert.match(f.indicator.textContent,/לשחרר/);f.handlers.touchend();assert.equal(f.refreshes(),1);
});
test('Scrolled panels, document scrolling, dialogs and input controls do not arm refresh',()=>{
 const f=gesture();const panel={scrollTop:20,scrollHeight:600,clientHeight:200};const child={closest:()=>null,parentElement:panel};
 f.handlers.touchstart(f.touch(100,100,child));panel.scrollTop=0;f.handlers.touchmove(f.touch(210));f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.document.scrollingElement.scrollTop=5;f.handlers.touchstart(f.touch(100));f.document.scrollingElement.scrollTop=0;f.handlers.touchmove(f.touch(210));f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.handlers.touchstart(f.touch(100,100,{closest:()=>({})}));f.handlers.touchmove(f.touch(210));f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.document.querySelector=()=>({});f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(210));f.handlers.touchend();assert.equal(f.refreshes(),0);
});
test('Short, cancelled and multiple-finger gestures never refresh',()=>{
 const f=gesture();f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(140));f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(200));f.handlers.touchcancel();f.handlers.touchend();assert.equal(f.refreshes(),0);
 f.handlers.touchstart(f.touch(100));f.handlers.touchmove({...f.touch(200),touches:[{},{}]});f.handlers.touchend();assert.equal(f.refreshes(),0);
});
function refreshContext(){
 const indicator={hidden:true,classList:{add(){},remove(){}}};let requests=0,reloads=0;const notices=[],stored=new Map();
 const context=vm.createContext({demoPreview:false,hasSecurityDraft:()=>false,securityBusy:false,loadBudgets:async()=>{},budgetURL:()=>'/api/plan',emptyBudget:()=>clone(demoPlan),hasScenarioDraft:()=>false,loading:false,saving:false,dirty:false,tab:'settings',settingsSection:'cash-accounts',selectedMonth:'2026-11',itemDraft:{id:'',name:'',amount:0},document:{activeElement:{blur(){}},getElementById:()=>indicator},confirmAction:(title,text,action)=>{context.confirm=action;notices.push(text);},notify:m=>notices.push(m),render(){},sessionStorage:{setItem:(k,v)=>stored.set(k,v)},window:{location:{reload(){reloads++;}}},async fetch(url,options){requests++;assert.equal(url,'/');assert.equal(options.cache,'no-store');return{ok:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>'<html>New UI</html>'};}});
 vm.runInContext(source.slice(source.indexOf('async function refreshBudget('),source.indexOf('\nasync function save()')),context);
 return{context,indicator,notices,stored,requests:()=>requests,reloads:()=>reloads};
}
test('Refresh protects unsaved changes, including edits committed on blur, and item drafts',async()=>{
 const f=refreshContext();f.context.document.activeElement.blur=()=>f.context.dirty=true;await f.context.refreshBudget();assert.equal(f.requests(),0);assert.equal(f.reloads(),0);assert.match(f.notices[0],/שינויים/);
 f.context.document.activeElement.blur=()=>{};f.context.dirty=false;f.context.itemDraft.name='Trip';await f.context.refreshBudget();assert.equal(f.requests(),0);assert.equal(f.reloads(),0);
});
test('Full UI refresh is single-flight and retains the current view for the next page load',async()=>{
 const f=refreshContext();f.context.saving=true;await f.context.refreshBudget();assert.equal(f.requests(),0);f.context.saving=false;f.context.loading=true;await f.context.refreshBudget();assert.equal(f.requests(),0);f.context.loading=false;await f.context.refreshBudget();assert.equal(f.requests(),1);assert.equal(f.reloads(),1);assert.equal(f.indicator.hidden,false);assert.deepEqual(JSON.parse(f.stored.get('monthly-flow-refresh-view')),{tab:'settings',settingsSection:'cash-accounts',selectedMonth:'2026-11'});
 await f.context.refreshBudget();assert.equal(f.reloads(),1);
});
test('An unavailable or invalid UI response keeps the current page usable',async()=>{
 for(const fetch of [async()=>{throw Error('Offline');},async()=>({ok:false}),async()=>({ok:true,headers:{get:()=> 'application/json'}})]){
  const f=refreshContext();f.context.fetch=fetch;await f.context.refreshBudget();assert.equal(f.reloads(),0);assert.equal(f.context.loading,false);assert.equal(f.indicator.hidden,true);assert.match(f.notices[0],/החיבור/);
 }
});
test('UI still reloads when optional session storage is unavailable',async()=>{
 const f=refreshContext();f.context.sessionStorage.setItem=()=>{throw Error('blocked');};await f.context.refreshBudget();assert.equal(f.reloads(),1);
});
function loadContext(fetch){
 const context=vm.createContext({tab:'progress',latestExpenseDataMonth,todayMonth:()=>'2026-11',newTrialMonth:()=>'2026-11',defaultBudgetMonth,demoPreview:false,loadBudgets:async()=>{},budgetURL:()=>'/api/plan',emptyBudget:()=>clone(demoPlan),joinToken:'',hasSecurityDraft:()=>false,securityBusy:false,isVault:()=>false,forgetVault(){},vaultEnvelope:null,refreshView:null,loading:false,loaded:true,plan:clone(demoPlan),demoPlan,clone,forecast,validatePlan,indexMonth,revision:1,dirty:false,loadError:'',accountId:'test-user',spacesSessionChanged:false,spaceRequireReload(){this.spacesSessionChanged=true;this.loaded=false;this.plan=clone(demoPlan);this.plan.opening=0;},accountEmail:'',selectedMonth:'2026-11',purchase:{firstMonth:'2026-12'},itemDraft:{firstMonth:'2026-12'},render(){},notify(){},fetch:async(...args)=>{const r=await fetch(...args),body=await r.json();return{...r,json:async()=>({accountId:'test-user',...body})};}});
 vm.runInContext(source.slice(source.indexOf('function defaultViewMonth('),source.indexOf('function notify(')),context);
 vm.runInContext(source.slice(source.indexOf('async function load('),source.indexOf('\nasync function refreshBudget(')),context);return context;
}
test('Successful refresh uses the latest saved plan but retains month and purchase date',async()=>{
 const next={...clone(demoPlan),opening:20000};const c=loadContext(async()=>({ok:true,json:async()=>({plan:next,revision:4,accountEmail:'test@example.com'})}));assert.equal(await c.load(true),true);assert.equal(c.plan.opening,20000);assert.equal(c.revision,4);assert.equal(c.selectedMonth,'2026-11');assert.equal(c.purchase.firstMonth,'2026-12');
});
test('Failed or malformed refresh keeps the last usable budget',async()=>{
 const c=loadContext(async()=>({ok:false,status:503,json:async()=>({error:'Offline'})}));assert.equal(await c.load(true),false);assert.equal(c.loaded,true);assert.equal(c.plan.opening,10000);assert.equal(c.loading,false);assert.equal(c.loadError,'Offline');
 c.fetch=async()=>({ok:true,json:async()=>({plan:{}})});assert.equal(await c.load(true),false);assert.equal(c.plan.opening,10000);
});

test('The new page loads saved budget data and restores the selected month',async()=>{
 const next={...clone(demoPlan),opening:25000};const c=loadContext(async()=>({ok:true,json:async()=>({plan:next,revision:5})}));c.refreshView={tab:'settings',selectedMonth:'2026-12'};await c.load();assert.equal(c.plan.opening,25000);assert.equal(c.selectedMonth,'2026-12');assert.equal(c.refreshView,null);
});

test('Full refresh also protects an uncommitted planning scenario',async()=>{
 const f=refreshContext();f.context.hasScenarioDraft=()=>true;await f.context.refreshBudget();assert.equal(f.reloads(),0);assert.equal(f.requests(),0);assert.match(f.notices[0],/תרחיש/);
});

test('Full refresh protects an uncommitted cheque, expense detail or category cap',async()=>{
 const f=refreshContext();f.context.hasDetailDraft=()=>true;await f.context.refreshBudget();assert.equal(f.reloads(),0);assert.equal(f.requests(),0);assert.match(f.notices[0],/בעריכה/);
});

test('Pull refresh tolerates initial diagonal jitter and fractional top offsets',()=>{const f=gesture();f.document.scrollingElement.scrollTop=0.75;f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(99,102));f.handlers.touchmove(f.touch(104,106));f.handlers.touchmove(f.touch(185,109));f.handlers.touchend();assert.equal(f.refreshes(),1);assert.equal(f.prevented(),1);});
test('A gesture already claimed by native scrolling cannot refresh on release',()=>{const f=gesture();f.handlers.touchstart(f.touch(100));f.handlers.touchmove({...f.touch(200),cancelable:false});f.handlers.touchend();assert.equal(f.refreshes(),0);assert.equal(f.indicator.hidden,true);});
test('A pull stops if the document starts scrolling or a dialog opens',()=>{const f=gesture();f.handlers.touchstart(f.touch(100));f.document.scrollingElement.scrollTop=10;f.handlers.touchmove(f.touch(200));f.handlers.touchend();assert.equal(f.refreshes(),0);f.document.scrollingElement.scrollTop=0;f.handlers.touchstart(f.touch(100));f.handlers.touchmove(f.touch(200));f.document.querySelector=()=>({});f.handlers.touchend();assert.equal(f.refreshes(),0);});
test('A nested scroller at its top never takes over the document refresh gesture',()=>{const f=gesture();const panel={scrollTop:0,scrollHeight:600,clientHeight:200};f.handlers.touchstart(f.touch(100,100,{closest:()=>null,parentElement:panel}));f.handlers.touchmove(f.touch(200));f.handlers.touchend();assert.equal(f.refreshes(),0);});

test('A dirty refresh requires an explicit choice and checks saved data without a server write',async()=>{const f=refreshContext();f.context.dirty=true;f.context.revision=7;f.context.validatePlan=validatePlan;f.context.isVault=()=>false;let archives=0;f.context.archiveDraftForRefresh=async()=>{archives++;};const calls=[];f.context.fetch=async(url,options)=>{calls.push([url,options]);return url==='/'?{ok:true,headers:{get:()=> 'text/html'},text:async()=>''}:{ok:true,json:async()=>({revision:8,plan:clone(demoPlan)})};};await f.context.refreshBudget();assert.equal(calls.length,0);assert.equal(f.reloads(),0);assert.match(f.notices[0],/לא תישלח לשרת/);await f.context.confirm();assert.equal(archives,1);assert.equal(f.reloads(),1);assert.deepEqual(calls.map(c=>c[0]),['/','/api/plan']);assert.ok(calls.every(([,o])=>!o.method&&o.cache==='no-store'));assert.equal(f.context.dirty,true);});
test('Failed latest-data fetch or draft archive never leaves or loses local edits',async()=>{for(const stage of ['data','archive']){const f=refreshContext();f.context.dirty=true;f.context.validatePlan=validatePlan;f.context.isVault=()=>false;f.context.archiveDraftForRefresh=async()=>{throw Error('Storage blocked');};f.context.fetch=async url=>url==='/'?{ok:true,headers:{get:()=> 'text/html'},text:async()=>''}:{ok:stage!=='data',json:async()=>({revision:8,plan:clone(demoPlan)})};await f.context.refreshBudget(true);assert.equal(f.reloads(),0);assert.equal(f.context.dirty,true);assert.equal(f.context.loading,false);assert.equal(f.context.refreshLeaving,false);}});
test('A false dirty marker with an unchanged saved snapshot refreshes without a choice',async()=>{const f=refreshContext();f.context.dirty=true;f.context.draftHasChanges=()=>false;await f.context.refreshBudget();assert.equal(f.context.dirty,false);assert.equal(f.reloads(),1);assert.equal(f.context.confirm,undefined);});

test('No-op mutations and reverting a change agree with the saved baseline',()=>{const original=clone(demoPlan),c=vm.createContext({plan:clone(original),dirty:false,draftSavedSnapshot:JSON.stringify(original),validatePlan,achievements:()=>[],todayMonth:()=> '2026-10',selectedMonth:'2026-10',monthlyPending:'',render(){},notify(){},document:{querySelector:()=>null}});vm.runInContext(source.slice(source.indexOf('function mutate('),source.indexOf('function confirmAction(')),c);c.mutate(clone(original));assert.equal(c.dirty,false);c.mutate({...clone(original),opening:12345});assert.equal(c.dirty,true);c.mutate(clone(original));assert.equal(c.dirty,false);});

test('Initial load selects current month instead of budget start and budget switching does not inherit the previous month',async()=>{
 const next={...clone(demoPlan),startMonth:'2026-01'};
 const c=loadContext(async()=>({ok:true,json:async()=>({plan:next,revision:2})}));
 assert.equal(await c.load(),true);assert.equal(c.selectedMonth,'2026-11');
 c.selectedMonth='2026-01';assert.equal(await c.load(false,true),true);assert.equal(c.selectedMonth,'2026-11');
 c.selectedMonth='2026-03';assert.equal(await c.load(true),true);assert.equal(c.selectedMonth,'2026-03');
});
test('Future-starting budget defaults to its first available month and an old short forecast still opens at current month',async()=>{
 for(const [start,expected]of [['2027-01','2027-01'],['2024-01','2026-11']]){
  const next={...clone(demoPlan),startMonth:start,horizon:12,expenses:[]};
  const c=loadContext(async()=>({ok:true,json:async()=>({plan:next,revision:2})}));assert.equal(await c.load(),true);assert.equal(c.selectedMonth,expected);assert.equal(c.plan.startMonth,start);
 }
});

test('Loading Expenses starts at latest recorded expense month and refresh preserves an explicit month',async()=>{const next={...clone(demoPlan),startMonth:'2026-01',months:{'2026-09':{values:{...demoPlan.defaults},actual:true,includesPlannedCard:false}}};const c=loadContext(async()=>({ok:true,json:async()=>({plan:next,revision:2})}));c.tab='details';assert.equal(await c.load(),true);assert.equal(c.selectedMonth,'2026-09');c.selectedMonth='2026-08';assert.equal(await c.load(true),true);assert.equal(c.selectedMonth,'2026-08');});
