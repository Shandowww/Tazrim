import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as bankParser from '../tools/bank-csv/parser.mjs';
import * as bankClassifier from '../tools/bank-csv/classifier.mjs';
import {makeFixture} from '../tools/bank-csv/xlsx-fixture.mjs';
import XLSX from '../tools/bank-csv/vendor/xlsx-mini.cjs';
import XLSFull from '../tools/bank-csv/vendor/xlsx-full.cjs';
import {inspectOneZeroPDF} from '../tools/bank-csv/pdf-reader.mjs';
import {pdfTextFixture,pdfFixture} from '../tools/bank-csv/pdf-fixture.mjs';
import {xlsFixture} from '../tools/bank-csv/xls-fixture.mjs';
import {readXlsx,readExcel,listSheets,inspectSheet} from '../tools/bank-csv/xlsx-reader.mjs';
function client(search=''){
 const app={innerHTML:'',listeners:new Map(),addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}},notice={textContent:'',scrollIntoView(){},classList:{add(){},remove(){}}},dialog={close(){},remove(){},querySelector:()=>notice},store=new Map();
 const promptNodes=new Map(),prompt={close(){this.open=false;},showModal(){this.open=true;},querySelector(selector){if(!promptNodes.has(selector))promptNodes.set(selector,{});return promptNodes.get(selector);}};
 const document={getElementById:id=>id.startsWith('scenario-')?null:id==='confirm-dialog'?prompt:id==='app'?app:['sg-transfer-dialog','sg-new-dialog','sg-free-dialog','sg-celebration','saving-schedule-dialog','wallet-dialog'].includes(id)?dialog:notice,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},activeElement:{blur(){}},scrollingElement:{scrollTop:0}};
 const c=vm.createContext({document,window:{monthlyFlowTheme:{choice:'system'},addEventListener(){},location:{reload(){}},innerHeight:900},location:{hash:'',pathname:'/',search,origin:'https://budget.test',hostname:'budget.test'},history:{replaceState(){}},sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},crypto,btoa,atob,TextEncoder,TextDecoder,URLSearchParams,URL,Blob,setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},Intl,console,fetch:async()=>{throw Error('unexpected request');}});
 for(const file of ['reconciliation-model.js','card-billing-model.js','budget.js','status-model.js','bank-import-model.js','savings-growth.js','investment-model.js','vault.js','amount-inputs.js','client.js','investment.js','planner.js','details.js','category-disclosure-client.js','spaces.js','security.js','savings.js','savings-accounts.js','savings-growth-client.js','wallet-installation-view.js','wallet-ui-model.js','apple-pay-client.js','onboarding.js','home.js','save-dock.js','bank-import-client.js','cash-accounts.js'])vm.runInContext(fs.readFileSync('src/'+file,'utf8').replaceAll(/^import .*;\n/gm,'').replaceAll(/^export /gm,''),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan(todayMonth());plan.demo=false;loaded=true;loading=false;revision=3;savingsReset();savingsTransfer={top:'house',bottom:'holiday',position:25};",c);
 return {c,app,notice,prompt,promptNodes};
}
test('Allocation sheet saves real goal data with the existing revision and clears the simulation',async()=>{
 const {c,notice}=client();let request;c.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({revision:4})};};
 assert.equal(vm.runInContext('hasSavingsDraft()',c),true);
 vm.runInContext("savingsTransferAction('sg-transfer-save',{})",c);await vm.runInContext('(async()=>{while(saving)await Promise.resolve();})()',c);
 assert.equal(request.url,'/api/plan?budget=personal');assert.equal(request.body.revision,3);assert.equal(request.body.plan.savingsGoals.items[0].allocated,390000);assert.equal(request.body.plan.savingsGoals.items[1].allocated,60000);assert.equal(request.body.plan.savingsGoals.balance,500000);assert.equal(vm.runInContext('revision',c),4);assert.equal(vm.runInContext('dirty',c),false);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);assert.match(notice.textContent,/נשמר/);
});
test('Failed allocation save retains the last edited allocation, revision and retryable unsaved state',async()=>{
 const {c,notice}=client();c.fetch=async()=>({ok:false,json:async()=>({error:'conflict: reload the saved budget'})});
 vm.runInContext("savingsTransferAction('sg-transfer-save',{})",c);await vm.runInContext('(async()=>{while(saving)await Promise.resolve();})()',c);
 assert.equal(vm.runInContext('revision',c),3);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('plan.savingsGoals.items[0].allocated',c),390000);assert.equal(vm.runInContext('savingsBalances(plan,todayMonth()).balance',c),500000);assert.match(notice.textContent,/conflict/);
});
test('Cancellation discards only the allocation simulation and preserves the selected home goal',()=>{
 const {c}=client();vm.runInContext("savingsUI.id='child';savingsTransferClose()",c);assert.equal(vm.runInContext('savingsUI.id',c),'child');assert.equal(vm.runInContext('plan.savingsGoals.items[0].allocated',c),400000);assert.equal(vm.runInContext('dirty',c),false);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);
});

test('Saving future goal pace persists a forecast without changing actual saving, expenses or cash flow',async()=>{
 const {c}=client();let request;c.fetch=async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({revision:4})};};
 const before=vm.runInContext('JSON.stringify({defaults:plan.defaults,months:plan.months,expenses:plan.expenses,balance:savingsBalances(plan,todayMonth()).balance,rows:forecast(plan)})',c);
 vm.runInContext("savingsTransfer=null;savingsUI.id='house';savingsSelected().sim.future=4000;savingsSelected().sim.changed=true;savingsAction('sg-rate',{dataset:{}})",c);
 await vm.runInContext('(async()=>{while(saving)await Promise.resolve();})()',c);
 assert.equal(request.plan.savingsGoals.items[0].monthly,4000);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);assert.equal(vm.runInContext('savingsResult(savingsSelected()).trial.count',c),50);
 assert.equal(vm.runInContext('JSON.stringify({defaults:plan.defaults,months:plan.months,expenses:plan.expenses,balance:savingsBalances(plan,todayMonth()).balance,rows:forecast(plan)})',c),before);
});

test('Monthly save records actual savings and budget in one revision-aware request, without adding twice',async()=>{
 const {c}=client();const requests=[];c.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({revision:3+requests.length})};};
 vm.runInContext("savingsTransfer=null;selectedMonth='2026-10';tab='monthly'",c);
 await vm.runInContext('commitMonthly(selectedMonth<=todayMonth())',c);assert.equal(requests.length,1);assert.equal(requests[0].revision,3);assert.equal(requests[0].plan.savingsGoals.poolDeposits['2026-10'],3200);assert.equal(vm.runInContext('savingsBalances(plan,todayMonth()).free',c),3200);assert.equal(vm.runInContext('dirty',c),false);
 await vm.runInContext('commitMonthly(selectedMonth<=todayMonth())',c);assert.equal(requests.length,2);assert.equal(requests[1].revision,4);assert.equal(vm.runInContext('savingsBalances(plan,todayMonth()).balance',c),503200);
});
test('Saving an estimate does not fund goals; a failed actual month save retains a retryable report',async()=>{
 const {c,notice}=client();let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:false,json:async()=>({error:'conflict: reload'})};};
 vm.runInContext("savingsTransfer=null;selectedMonth='2026-11';tab='monthly'",c);await vm.runInContext('commitMonthly(selectedMonth<=todayMonth())',c);assert.equal(sent.plan.savingsGoals.poolDeposits,undefined);
 vm.runInContext("selectedMonth='2026-10'",c);await vm.runInContext('commitMonthly(selectedMonth<=todayMonth())',c);assert.equal(vm.runInContext('revision',c),3);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('savingsBalances(plan,todayMonth()).free',c),3200);assert.match(notice.textContent,/conflict/);
});

test('Guided setup keeps a temporary draft and saves only its reviewed final budget',async()=>{
 const {c}=client();let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({revision:4})};};
 vm.runInContext("savingsTransfer=null;plan=emptyBudget();onboardingStart()",c);assert.equal(vm.runInContext('hasOnboardingDraft()',c),true);assert.equal(sent,undefined);assert.equal(vm.runInContext('plan.opening',c),0);assert.equal(vm.runInContext('canSwitchBudget()',c),false);
 vm.runInContext("Object.assign(onboarding.values,{opening:'10000',salary:'19000',balance:'500000',accounts:[{id:'bank',name:'בנק',balance:500000}],goalName:'בית',target:'600000',allocated:'400000'});onboarding.step=4",c);c.setupForm={id:'setup-form',elements:[],querySelector:()=>null};await vm.runInContext('onboardingSubmit(setupForm)',c);
 assert.equal(sent.revision,3);assert.equal(sent.plan.opening,10000);assert.equal(sent.plan.savingsGoals.balance,500000);assert.equal(vm.runInContext('hasOnboardingDraft()',c),false);assert.equal(vm.runInContext('dirty',c),false);
});
test('Setup will not replace an existing budget and demo setup never makes saving requests',async()=>{
 const real=client();vm.runInContext('savingsTransfer=null;onboardingStart()',real.c);assert.equal(vm.runInContext('onboarding',real.c),null);assert.match(real.notice.textContent,/כבר יש נתונים/);
 const {c}=client('?demo=1');let calls=0;c.fetch=async()=>{calls++;throw Error('unexpected request');};vm.runInContext("savingsTransfer=null;onboardingStart();onboarding.values.goalEnabled=false;onboarding.step=4",c);c.setupForm={id:'setup-form',elements:[],querySelector:()=>null};await vm.runInContext('onboardingSubmit(setupForm)',c);assert.equal(calls,0);assert.equal(vm.runInContext('tab',c),'monthly');assert.equal(vm.runInContext('isUnconfiguredBudget(plan)',c),false);
});


test('Home goal popup protects drafts, cancellation preserves the budget, and creation retains explicit save',()=>{
 const {c}=client();const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext("savingsTransfer=null;savingsNewGoal={scope:activeBudget}",c);assert.equal(vm.runInContext('hasSavingsDraft()',c),true);assert.equal(vm.runInContext('canSwitchBudget()',c),false);vm.runInContext('savingsNewGoalClose()',c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);
 c.form={querySelector:()=>({textContent:''})};c.budgetFormData=()=>new Map([['name','טיול'],['target','25,000'],['icon','plane']]);vm.runInContext('savingsNewGoal={scope:activeBudget};savingsNewGoalSubmit(form)',c);assert.equal(vm.runInContext('plan.savingsGoals.items.length',c),5);assert.equal(vm.runInContext('plan.savingsGoals.items.at(-1).target',c),25000);assert.equal(vm.runInContext('plan.savingsGoals.items.at(-1).allocated',c),0);assert.equal(vm.runInContext('savingsBalances(plan,todayMonth()).balance',c),500000);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);assert.equal(vm.runInContext('savingsUI.id===plan.savingsGoals.items.at(-1).id',c),true);
});
test('Invalid new goals retain their popup and leave existing records unchanged',()=>{
 const {c}=client(),error={textContent:''};c.form={querySelector:()=>error};c.budgetFormData=()=>new Map([['name','טיול'],['target','0'],['icon','plane']]);const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext('savingsTransfer=null;savingsNewGoal={scope:activeBudget};savingsNewGoalSubmit(form)',c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.equal(vm.runInContext('hasSavingsDraft()',c),true);assert.match(error.textContent,/תקינים/);assert.equal(vm.runInContext('dirty',c),false);
});

test('Hamburger groups account controls and settings; home add action follows the current goal',()=>{
 const {c,app}=client();vm.runInContext("savingsTransfer=null;tab='progress';render()",c);
 const menu=vm.runInContext('appMenuView()',c);assert.match(menu,/name="active-budget"/);assert.match(menu,/data-tab="settings"/);assert.equal((menu.match(/data-action="save"/g)||[]).length,1);assert.equal((menu.match(/data-action="refresh"/g)||[]).length,1);assert.doesNotMatch(menu,/דוגמה מלאה|התפריט שלי/);assert.match(menu,/id="app-menu-title">תפריט</);assert.match(menu,/data-settings-section="app"/);assert.match(menu,/data-tab="manual"/);assert.doesNotMatch(menu,/data-settings-section="cash-accounts"/);
 const header=app.innerHTML.match(/<header[\s\S]*?<\/header>/)[0];assert.match(header,/app-menu-open/);assert.doesNotMatch(header,/data-action="save"|active-budget/);
 const nav=app.innerHTML.match(/<nav class="tabs"[\s\S]*?<\/nav>/)[0];assert.doesNotMatch(nav,/settings/);assert.equal((nav.match(/class="tab"/g)||[]).length,5);
 const home=vm.runInContext('savingsHomeView()',c);assert.ok(home.indexOf('sg-home-actions')>home.indexOf('sg-projection'));assert.equal((home.match(/data-action="sg-new-open"/g)||[]).length,1);
});

test('Direct menu destinations show only their own forms and preserve financial data',()=>{
 const {c,app}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[]',c);
 const before=vm.runInContext('JSON.stringify(plan)',c);
 const click=section=>app.listeners.get('click').find(fn=>String(fn).includes('appMenuAction'))({target:{closest:()=>({dataset:{action:'tab',tab:'settings',settingsSection:section},closest:()=>null})}});
 click('cash-accounts');assert.match(app.innerHTML,/<h1>חשבונות הבנק<\/h1>/);assert.match(app.innerHTML,/id="cash-settings"/);assert.doesNotMatch(app.innerHTML,/id="settings-form"|name="appearance-theme"/);
 click('budget');assert.match(app.innerHTML,/id="settings-form"/);assert.doesNotMatch(app.innerHTML,/id="cash-settings"|name="appearance-theme"/);
 click('privacy');assert.match(app.innerHTML,/id="import-file"/);assert.doesNotMatch(app.innerHTML,/name="appearance-theme"|id="settings-form"/);
 click('app');assert.match(app.innerHTML,/<h1>הגדרות אפליקציה<\/h1>/);assert.match(app.innerHTML,/name="appearance-theme"/);assert.doesNotMatch(app.innerHTML,/התראות במכשיר|push-enable|עשרת הימים/);assert.doesNotMatch(app.innerHTML,/id="import-file"|id="settings-form"|<details class="settings-category"/);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Direct menu navigation protects unfinished account, monthly and encryption edits',()=>{
 const {c,app}=client();vm.runInContext("savingsTransfer=null;tab='settings';settingsSection='cash-accounts';cashUI.dirty=true",c);
 const click=()=>app.listeners.get('click').find(fn=>String(fn).includes('appMenuAction'))({target:{closest:()=>({dataset:{action:'tab',tab:'settings',settingsSection:'app'},closest:()=>null})}});
 click();assert.equal(vm.runInContext('settingsSection',c),'cash-accounts');assert.equal(vm.runInContext('cashUI.dirty',c),true);
 vm.runInContext("cashUI.dirty=false;monthlyPending='2026-10'",c);click();assert.equal(vm.runInContext('settingsSection',c),'cash-accounts');
 vm.runInContext("monthlyPending='';securitySetup={snapshot:'pending'}",c);click();assert.equal(vm.runInContext('settingsSection',c),'cash-accounts');assert.equal(vm.runInContext('securitySetup.snapshot',c),'pending');
});

test('Monthly save asks actual versus estimate before sending any request',async()=>{
 const {c,prompt,promptNodes}=client();let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
 vm.runInContext("savingsTransfer=null;selectedMonth='2026-10';tab='monthly'",c);
 vm.runInContext('saveMonthly()',c);assert.equal(sent,undefined);assert.equal(prompt.open,true);assert.match(promptNodes.get('.actions').innerHTML,/נתוני אמת/);
 await promptNodes.get('.actions').onclick({target:{dataset:{monthChoice:'estimate'}}});assert.equal(sent.plan.months['2026-10'].actual,false);assert.equal(sent.plan.savingsGoals.poolDeposits['2026-10'],undefined);
 vm.runInContext("selectedMonth='2026-11';saveMonthly()",c);assert.doesNotMatch(promptNodes.get('.actions').innerHTML,/נתוני אמת/);
 await promptNodes.get('.actions').onclick({target:{dataset:{monthChoice:'cancel'}}});assert.equal(prompt.open,false);
});

test('Investment assumptions and copied actual deposit averages never change budget, goals or revision',()=>{
 const {c,app}=client();const before=vm.runInContext('JSON.stringify({plan,revision,dirty})',c);
 vm.runInContext("calculatorMode='investment';tab='purchase';render();investmentUI={initial:100000,monthly:investmentHistory().average,years:20,annualReturn:5,annualIncrease:3};render()",c);
 assert.match(app.innerHTML,/שווי משוער/);assert.match(app.innerHTML,/תכנון תשלומים/);assert.equal(vm.runInContext('investmentHistory().average',c),2300);assert.equal(vm.runInContext('JSON.stringify({plan,revision,dirty})',c),before);
 vm.runInContext("trialAction('trial-open',{})",c);assert.equal(vm.runInContext('calculatorMode',c),'payments');assert.match(app.innerHTML,/הוספה לתכנון/);
});


test('Invalid investment input survives slider updates and prevents a hidden-value goal offer',()=>{
 const {c}=client();vm.runInContext("calculatorMode='investment';tab='purchase';render()",c);
 c.field={name:'investment-monthly',value:'1000',checkValidity:()=>true};vm.runInContext('investmentInput(field)',c);assert.match(vm.runInContext('investmentGoalOffer()',c),/עדכון היעד/);
 c.field.value='';vm.runInContext('investmentInput(field)',c);
 c.range={name:'investment-years',value:'25',checkValidity:()=>true};vm.runInContext('investmentInput(range)',c);
 assert.match(vm.runInContext('investmentResults()',c),/יש להשלים/);assert.equal(vm.runInContext('investmentGoalOffer()',c),'');
 assert.match(vm.runInContext('investmentView()',c),/name="investment-monthly"[^>]*value=""/);
 c.field.value='500';vm.runInContext('investmentInput(field)',c);assert.match(vm.runInContext('investmentResults()',c),/שווי משוער/);assert.equal(vm.runInContext('investmentUI.monthly',c),500);
});
test('Existing scenario removals require review and cancellation preserves saved expenses',()=>{
 const {c,prompt,promptNodes}=client();const before=vm.runInContext('JSON.stringify(plan)',c);
 vm.runInContext("savingsTransfer=null;resetScenario();scenarioItems=[{...plan.expenses[0],id:crypto.randomUUID(),originalId:plan.expenses[0].id,enabled:false}];trialAction('trial-apply',{})",c);
 assert.equal(prompt.open,true);assert.match(promptNodes.get('#confirm-text').textContent,/הסרה/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 promptNodes.get('#confirm-cancel').onclick();assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Invalid exact payment count blocks apply until corrected',()=>{
 const {c,notice}=client();vm.runInContext("resetScenario();purchase.amount=500",c);const before=vm.runInContext('JSON.stringify(plan)',c);
 c.field={name:vm.runInContext("'trial-'+primaryTrialId+'--payments-number'",c),value:'0',setCustomValidity(){},reportValidity(){}};
 vm.runInContext("handleTrialInput(field);trialAction('trial-apply',{})",c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.match(notice.textContent,/לתקן/);
 c.field.value='6';vm.runInContext("handleTrialInput(field);trialAction('trial-apply',{})",c);assert.equal(vm.runInContext('plan.expenses.at(-1).payments',c),6);
});

test('Actual save queues one home celebration; failed save waits for a successful retry',async()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null',c);c.fetch=async()=>({ok:false,json:async()=>({error:'failed'})});await vm.runInContext('commitMonthly(true)',c);
 assert.equal(vm.runInContext('savingsCelebration',c),null);assert.equal(vm.runInContext('dirty',c),true);
 c.fetch=async()=>({ok:true,json:async()=>({revision:4})});await vm.runInContext('commitMonthly(true)',c);
 assert.ok(vm.runInContext('savingsCelebration.amount>0',c));vm.runInContext("savingsFreeAction('sg-celebration-close',{})",c);
 await vm.runInContext('commitMonthly(true)',c);assert.equal(vm.runInContext('savingsCelebration',c),null);
});
test('Home hides zero free funds, shows positive cents, and retains goal and deposit actions',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null',c);
 const empty=vm.runInContext('savingsHomeView()',c);
 assert.doesNotMatch(empty,/class="sg-free-pool"/);
 assert.match(empty,/role="progressbar"/);assert.match(empty,/data-action="saving-schedule-open"/);
 vm.runInContext('plan.savingsGoals.items[0].allocated-=0.01',c);
 const positive=vm.runInContext('savingsHomeView()',c);
 assert.match(positive,/class="sg-free-pool"/);assert.match(positive,/has-free-funds/);
 assert.match(positive,/data-action="sg-free-open"/);assert.match(positive,/0\.01/);
 assert.equal(vm.runInContext('savingsFreeView({free:-1})',c),'');
 assert.equal(vm.runInContext('savingsTransferChoices().every(g=>g.id)',c),true);
});

test('Saving schedule cancellation preserves financial data and blocks switching while the editor is open',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;savingScheduleDraft={scope:activeBudget}',c);const before=vm.runInContext('JSON.stringify(plan)',c);
 assert.equal(vm.runInContext('hasSavingsDraft()',c),true);assert.equal(vm.runInContext('canSwitchBudget()',c),false);
 vm.runInContext("savingScheduleAction('saving-schedule-close')",c);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Applying a saving schedule preserves untouched values, supports zero and retains explicit save',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;savingScheduleDraft={scope:activeBudget}',c);c.budgetFormData=()=>new Map([['schedule-from','2026-11'],['schedule-personalSaving','0'],['schedule-sharedSaving','']]);c.form={elements:{namedItem:()=>({dataset:{current:'2500'}})},querySelector:()=>({})};const before=vm.runInContext('JSON.stringify(plan.savingsGoals)',c);
 vm.runInContext('savingScheduleSubmit(form)',c);assert.equal(vm.runInContext("monthlyValues(plan,'2026-11').personalSaving",c),0);assert.equal(vm.runInContext("monthlyValues(plan,'2026-11').sharedSaving",c),2500);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('savingScheduleDraft',c),null);assert.equal(vm.runInContext('JSON.stringify(plan.savingsGoals)',c),before);
});


test('Payment calendar preserves legacy total, removes fees input, paginates and replaces price without double counting',()=>{
 const {c}=client();vm.runInContext("savingsTransfer=null;resetScenario();purchase={name:'בדיקה',amount:6000,fees:180,firstMonth:todayMonth(),source:'direct'};selectedPayments=6",c);
 const before=vm.runInContext('JSON.stringify(plan)',c),calendar=vm.runInContext('paymentCalendar()',c),card=vm.runInContext('trialCard(trialDrafts()[0],0)',c);
 assert.match(calendar,/1,030/);assert.match(card,/data-current="6180"/);assert.doesNotMatch(card,/--fees/);assert.match(card,/אפשרויות מתקדמות/);
 vm.runInContext("handleTrialInput({name:'trial-'+primaryTrialId+'--amount',value:'6000',dataset:{current:'6180'}})",c);
 assert.equal(vm.runInContext('purchase.fees',c),0);assert.match(vm.runInContext('paymentCalendar()',c),/1,000/);
 vm.runInContext('selectedPayments=60;paymentPage=4',c);const finalPage=vm.runInContext('paymentCalendar()',c);
 assert.equal((finalPage.match(/<article class="payment-month /g)||[]).length,12);assert.match(finalPage,/5 \/ 5/);assert.match(finalPage,/100/);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Deadline warning updates with a goal simulation and edited optional dates persist or can be removed',()=>{const {c}=client();vm.runInContext("savingsTransfer=null;plan.savingsGoals.items[0].deadline='2027-01-31';savingsUI.id='house';savingsSelected().sim.future=1000",c);assert.match(vm.runInContext('savingsDeadlineView(savingsSelected())',c),/צפויה חריגה/);assert.match(vm.runInContext('savingsDeadlineView(savingsSelected())',c),/ללא תשואה/);vm.runInContext('savingsSelected().sim.future=100000;savingsSelected().sim.changed=true',c);assert.doesNotMatch(vm.runInContext('savingsDeadlineView(savingsSelected())',c),/sg-deadline-warning/);assert.match(vm.runInContext('savingsDeadlineView(savingsSelected())',c),/יש לשמור/);c.form={id:'',dataset:{sgForm:'goal'}};c.budgetFormData=()=>new Map([['id','house'],['name','בית'],['target','600000'],['icon','house'],['deadline','2028-02-29']]);vm.runInContext('savingsSubmit(form)',c);assert.equal(vm.runInContext('plan.savingsGoals.items[0].deadline',c),'2028-02-29');assert.equal(vm.runInContext('dirty',c),true);c.budgetFormData=()=>new Map([['id','house'],['name','בית'],['target','600000'],['icon','house'],['deadline','']]);vm.runInContext('savingsSubmit(form)',c);assert.equal(vm.runInContext('plan.savingsGoals.items[0].deadline',c),undefined);});

test('Apple Pay monthly copy replaces a card amount exactly once, preserves all other fields and awaits explicit monthly save',()=>{const {c}=client();vm.runInContext("savingsTransfer=null;walletScope=activeBudget;walletMonth='2026-10';walletData={truncated:false,events:[{card_id:'card1',state:'included',currency:'ILS',cents:1000,kind:'purchase'},{card_id:'card1',state:'included',currency:'ILS',cents:2500,kind:'purchase'}]};confirmAction=(title,text,accept)=>accept();",c);const before=vm.runInContext('JSON.stringify({salary:monthlyValues(plan,"2026-10").salary,balance:savingsBalances(plan,todayMonth()).balance,expenses:plan.expenses,saving:monthlyValues(plan,"2026-10").personalSaving})',c);vm.runInContext("walletApply('card1')",c);assert.equal(vm.runInContext("plan.months['2026-10'].values.card1",c),35);assert.equal(vm.runInContext('monthlyPending',c),'2026-10');assert.equal(vm.runInContext('tab',c),'monthly');assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('JSON.stringify({salary:monthlyValues(plan,"2026-10").salary,balance:savingsBalances(plan,todayMonth()).balance,expenses:plan.expenses,saving:monthlyValues(plan,"2026-10").personalSaving})',c),before);vm.runInContext("walletApply('card1')",c);assert.equal(vm.runInContext("plan.months['2026-10'].values.card1",c),35);});
test('Apple Pay keeps incomplete/foreign/duplicate data and draft conflicts out of monthly changes',()=>{const {c}=client();vm.runInContext("savingsTransfer=null;walletScope=activeBudget;walletMonth='2026-10';walletData={truncated:false,events:[{card_id:'card1',state:'pending',currency:'ILS',cents:1000,kind:'purchase'},{card_id:'card1',state:'duplicate',currency:'ILS',cents:1000,kind:'purchase'},{card_id:'card1',state:'included',currency:'USD',cents:1000,kind:'purchase'}]};confirmAction=(title,text,accept)=>accept();",c);const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext("walletApply('card1')",c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);vm.runInContext("walletData.events=[{card_id:'card1',state:'included',currency:'ILS',cents:1000,kind:'purchase'}];walletData.truncated=true;walletApply('card1');walletData.truncated=false;dirty=true;walletApply('card1');dirty=false;walletError='network';walletApply('card1');",c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);});

test('Global save entry appears for form/simulation drafts and routes monthly reports to explicit confirmation',async()=>{const {c}=client();vm.runInContext('savingsTransfer=null;dirty=false;savingsUI.formDirty=true',c);assert.match(vm.runInContext('saveDockState().context',c),/חסכונות/);vm.runInContext("savingsUI.formDirty=false;purchase.amount=1000",c);assert.match(vm.runInContext('saveDockState().context',c),/תרחיש/);c.monthlyCalls=0;vm.runInContext("resetScenario();monthlyPending='2026-10';saveMonthly=()=>monthlyCalls++",c);await vm.runInContext('saveAllChanges()',c);assert.equal(c.monthlyCalls,1);assert.equal(vm.runInContext("plan.months['2026-10'].actual",c),true);assert.equal(vm.runInContext('monthlyPending',c),'2026-10');});
test('Global save commits multiple goal forms and persists one revision-aware request, preserving allocations',async()=>{const {c}=client();let requests=[];c.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({revision:4})}};vm.runInContext("savingsTransfer=null;dirty=false;saveDockScope=accountId+'/'+activeBudget",c);for(const [id,name,target,icon]of [['house','בית חדש',650000,'house'],['holiday','חופשה חדשה',90000,'plane']]){const form={id:'',dataset:{sgForm:'goal',saveDockEdited:'true'},isConnected:true,tagName:'FORM',parentElement:null,elements:{namedItem:()=>({value:id})},querySelector:()=>null,scrollIntoView(){},reportValidity:()=>true};form.requestSubmit=()=>{c.budgetFormData=()=>new Map([['id',id],['name',name],['target',target],['icon',icon],['deadline','']]);c.submittedForm=form;vm.runInContext('savingsSubmit(submittedForm)',c);};c.pendingForm=form;vm.runInContext('saveDockEditors.set(saveDockKey(pendingForm),pendingForm);savingsUI.formDirty=true',c);}await vm.runInContext('saveAllChanges()',c);assert.equal(requests.length,1);assert.equal(requests[0].revision,3);assert.equal(requests[0].plan.savingsGoals.items[0].name,'בית חדש');assert.equal(requests[0].plan.savingsGoals.items[1].name,'חופשה חדשה');assert.equal(requests[0].plan.savingsGoals.items[0].allocated,400000);assert.equal(vm.runInContext('dirty',c),false);assert.equal(vm.runInContext('hasSavingsDraft()',c),false);assert.equal(vm.runInContext('saveDockState()',c),null);});
test('Failed global save keeps pending data and a retryable visible save state',async()=>{const {c}=client();vm.runInContext('savingsTransfer=null;dirty=true',c);const before=vm.runInContext('JSON.stringify(plan)',c);c.fetch=async()=>({ok:false,json:async()=>({error:'conflict: reload'})});await vm.runInContext('saveAllChanges()',c);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('revision',c),3);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.match(vm.runInContext('saveDockState().context',c),/לא נשמרו/);});
test('Free allocation sliders share the available cents and release capacity when another goal is reduced',()=>{const {c}=client();const a={value:'45000.25',dataset:{}},b={value:'4999.75',dataset:{}};c.sliderForm={querySelectorAll:()=>[a,b]};vm.runInContext('savingsLimitAllocations(sliderForm,50000)',c);assert.equal(a.max,45000.25);assert.equal(b.max,4999.75);a.value='0';vm.runInContext('savingsLimitAllocations(sliderForm,50000)',c);assert.equal(b.max,50000);assert.equal(a.max,45000.25);const html=vm.runInContext('savingsAllocationDialog()',c);assert.match(html,/type="range"/);assert.doesNotMatch(html,/type="number"/);assert.match(html,/data-free-amount/);});


test('Home report closes only after successful saving, then asks for an additional saving amount',async()=>{
 const {c}=client();
 vm.runInContext("savingsTransfer=null;homeReset();plan=setReportedCashBalance(plan,'2026-10',34980);homeUI.reportMonth='2026-10';selectedMonth='2026-10';tab='monthly';",c);
 c.fetch=async()=>({ok:false,json:async()=>({error:'conflict'})});
 await vm.runInContext('commitMonthly(true)',c);
 assert.equal(vm.runInContext('tab',c),'monthly');
 assert.equal(vm.runInContext('homeUI.savingMonth',c),null);
 c.fetch=async()=>({ok:true,json:async()=>({revision:4})});
 await vm.runInContext('commitMonthly(true)',c);
 assert.equal(vm.runInContext('tab',c),'goals');
 assert.equal(vm.runInContext('homeUI.savingMonth',c),'2026-10');
 assert.match(vm.runInContext('goalsView()',c),/כמה תרצה להפקיד/);
});

test('Failed planned-saving save retries one pending bank request without posting actual savings',async()=>{
 const {c}=client();let requests=[];
 vm.runInContext("savingsTransfer=null;homeReset();plan=saveMonthReport(setReportedCashBalance(plan,'2026-10',34980),'2026-10',true,'2026-10');homeUI.savingMonth='2026-10';homeUI.savingDraft={personal:'100.25',shared:'50.50',applied:false};",c);
 const before=vm.runInContext("savingsBalances(plan,'2026-10').balance",c);
 c.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:false,json:async()=>({error:'offline'})};};
 await vm.runInContext('homeSavingPersist()',c);
 assert.equal(vm.runInContext('dirty',c),true);
 assert.equal(vm.runInContext('homeUI.savingDraft.applied',c),true);
 c.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext('homeSavingPersist()',c);
 assert.deepEqual(requests[0].plan,requests[1].plan);
 assert.equal(Math.round((vm.runInContext("savingsBalances(plan,'2026-10').balance",c)-before)*100),0);
 assert.equal(vm.runInContext("plan.savingTransfers.length",c),1);
 assert.equal(vm.runInContext("plan.savingTransfers[0].status",c),'pending');
 assert.equal(vm.runInContext("Math.round((plan.savingTransfers[0].personal+plan.savingTransfers[0].shared)*100)",c),15075);
 assert.equal(vm.runInContext('homeUI.savingDraft',c),null);
 assert.equal(vm.runInContext('dirty',c),false);
});

test('Bank restart keeps the existing budget until reviewed save; close cancels the reset',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;dirty=false;',c);
 const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
 const before=vm.runInContext('JSON.stringify(plan)',c);
 vm.runInContext('bankOpen({restart:true})',c);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 assert.equal(vm.runInContext('bankUI.base.months&&Object.keys(bankUI.base.months).length',c),0);
 assert.match(nodes.get('bank-import-dialog').innerHTML,/הורדת גיבוי לפני איפוס/);
 vm.runInContext('bankClose()',c);assert.equal(vm.runInContext('bankUI',c),null);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Initial screen leads to combined Report Center and an unsaved empty reset can still open bank import',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;plan=emptyBudget();dirty=true;',c);
 const welcome=vm.runInContext('onboardingWelcome()',c);assert.match(welcome,/CSV, XLSX, XLS ו־PDF נתמך/);assert.match(welcome,/data-action="report-inbox"/);assert.match(welcome,/דוחות בנק ואשראי יחד/);
 const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
 vm.runInContext('bankOpen({restart:true})',c);assert.ok(nodes.has('bank-import-dialog'));assert.equal(vm.runInContext('Object.keys(plan.months).length',c),0);
});
test('Failed bank save retries the same imported snapshot and sends no duplicate entries',async()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;dirty=false;',c);
 const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
 vm.runInContext('bankOpen({restart:true});bankUI.committed=true;',c);
 let sent=[];c.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:false,json:async()=>({error:'offline'})};};
 await vm.runInContext('dirty=true;bankPersist()',c);assert.equal(vm.runInContext('dirty',c),true);assert.ok(nodes.has('bank-import-dialog'));
 c.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({revision:4})};};await vm.runInContext('bankPersist()',c);
 assert.deepEqual(sent[0],sent[1]);assert.equal(vm.runInContext('dirty',c),false);assert.equal(vm.runInContext('bankUI',c),null);
});

test('XLSX upload reads ten-column source locally and reset applies only after reviewed save',async()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;dirty=false;',c);
 const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
 c.modules=[bankParser,bankClassifier];vm.runInContext('bankApi=modules;',c);
 c.Worker=class{listeners=new Map();addEventListener(type,callback){this.listeners.set(type,callback);}removeEventListener(type){this.listeners.delete(type);}terminate(){}postMessage(data){const workbook=readXlsx(new Uint8Array(data.bytes),XLSX),sheets=listSheets(workbook),selected=sheets[0].name;Promise.resolve().then(()=>this.listeners.get('message')?.({data:{id:data.id,sheets,selected,inspection:inspectSheet(workbook,selected,XLSX)}}));}};
 c.file=new File([makeFixture({hapoalim:true})],'synthetic.xlsx');
 const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext('bankOpen({restart:true})',c);await vm.runInContext('bankLoadFile(file)',c);
 assert.equal(vm.runInContext('bankUI.records.length',c),2);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext("bankUI.reviewFilter='all'",c);const review=vm.runInContext('bankRowsView(bankCurrentPreview(),[])',c);
 assert.ok(review.includes(vm.runInContext('money(18500.25)',c)));
 assert.ok(review.includes(vm.runInContext('money(-100.25)',c)));
 vm.runInContext("bankUI.from='2026-01-01';bankUI.to='2026-09-30';bankUI.base.startMonth='2026-01';bankUI.coverageConfirmed=true;bankUI.monthsConfirmed=true;bankUI.resetConfirmed=true;for(const r of bankUI.records){bankUI.choices[r.line]={field:r.amountCents>0?'salary':'card1',reviewed:true};bankUI.modes[r.date.slice(0,7)]='full';}",c);
 let request;c.fetch=async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(request.plan.bankImport.entries.length,2);assert.equal(request.plan.months['2026-01'].values.salary,18500.25);assert.equal(request.plan.months['2026-09'].values.card1,100.25);assert.equal(request.plan.expenses.length,0);assert.equal(vm.runInContext('bankUI',c),null);
});

test('CSV bank review displays shekels and preserves cents through save, reload and overlapping import',async()=>{
 for(const debit of ['1000','1,000.00','1.000,00','1,000.25','1.000,25','12,345,678.90','12.345.678,90']){
  const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;dirty=false;',c);
  const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
  c.modules=[bankParser,bankClassifier];vm.runInContext('bankApi=modules;',c);
  const amount=debit.includes('678')?12345678.9:debit.includes('25')?1000.25:1000;
  c.file=new File([`תאריך,הפעולה,אסמכתא,חובה,זכות,יתרה בש״ח\n12/02/2026,החזר הלוואה,000123,"${debit}",,"-1.000,25"\n13/02/2026,משכורת,000124,,"20,000.50","18.000,25"`],'synthetic.csv');
  const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext('bankOpen({restart:true})',c);await vm.runInContext('bankLoadFile(file)',c);
  assert.equal(vm.runInContext('bankUI.error',c),'');assert.equal(vm.runInContext('bankUI.records[0].amountCents',c),-Math.round(amount*100));
  assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
  c.expectedAmount=amount;
  vm.runInContext("bankUI.reviewFilter='all'",c);const html=vm.runInContext('bankRowsView(bankCurrentPreview(),[])',c);
  assert.ok(html.includes(vm.runInContext('money(-expectedAmount)',c)),debit);
  assert.ok(!html.includes(vm.runInContext('money(-expectedAmount*100)',c)),debit);
  assert.ok(html.includes(vm.runInContext('money(20000.5)',c)));
  vm.runInContext("bankUI.from='2026-02-01';bankUI.to='2026-02-28';bankUI.coverageConfirmed=true;bankUI.monthsConfirmed=true;bankUI.resetConfirmed=true;bankUI.modes={'2026-02':'full'};for(const r of bankUI.records)bankUI.choices[r.line]={field:r.amountCents<0?'loanRepayment':'salary',reviewed:true};",c);
  let saved;c.fetch=async(url,options)=>{saved=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
  await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
  assert.equal(saved.plan.months['2026-02'].values.loanRepayment,amount);
  assert.equal(saved.plan.months['2026-02'].values.salary,20000.5);
  assert.equal(saved.plan.months['2026-02'].cashReport.balance,18000.25);
  assert.equal(saved.plan.bankImport.entries[0].cents,-Math.round(amount*100));
  c.saved=saved.plan;vm.runInContext('plan=JSON.parse(JSON.stringify(saved));',c);
  const persisted=vm.runInContext('JSON.stringify(plan)',c);
  vm.runInContext('bankOpen()',c);await vm.runInContext('bankLoadFile(file)',c);
  assert.equal(vm.runInContext("bankCurrentPreview().rows.every(r=>r.state==='duplicate')",c),true);
  assert.equal(vm.runInContext('JSON.stringify(plan)',c),persisted);
 }
});

async function groupedBankClient(csv){
 const {c,...rest}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];purchaseEnabled=false;dirty=false;',c);
 const nodes=new Map();c.document.createElement=()=>({innerHTML:'',addEventListener(){},setAttribute(){},showModal(){},remove(){nodes.delete(this.id);}});c.document.body={append(n){nodes.set(n.id,n);},classList:{add(){},remove(){}}};const oldGet=c.document.getElementById;c.document.getElementById=id=>nodes.get(id)||(id==='save-changes-dock'?null:oldGet(id));
 c.modules=[bankParser,bankClassifier];vm.runInContext('bankApi=modules;',c);c.file=new File([csv],'synthetic-groups.csv');
 vm.runInContext('bankOpen({restart:true})',c);await vm.runInContext('bankLoadFile(file)',c);assert.equal(vm.runInContext('bankUI.error',c),'');
 return {c,nodes,...rest};
}
test('Group approval spans detail pages and varying amounts, protects reviewed exceptions and saves each identity once',async()=>{
 const amounts=Array.from({length:65},(_,i)=>100+i/4),csv='תאריך,הפעולה,פרטים,אסמכתא,חובה,זכות,לטובת,עבור\n'+amounts.map((n,i)=>`12/02/2026,העברה,פירוט ${i},${i+1},${n.toFixed(2)},,מוטב א,מטרה ${i}`).join('\n');
 const {c,nodes}=await groupedBankClient(csv);let requests=0;c.fetch=async()=>{requests++;throw Error('must not save before review');};
 const before=vm.runInContext('JSON.stringify(plan)',c),source=vm.runInContext('JSON.stringify(bankUI.records)',c);
 vm.runInContext("for(const r of bankUI.records.slice(0,2))bankUI.choices[r.line]={field:'variable',reviewed:true,manual:true};bankUI.monthsConfirmed=true;bankUI.openGroups={'0':true};bankRender();",c);
 assert.match(nodes.get('bank-import-dialog').innerHTML,/קבוצות לפי פעולה ומוטב/);assert.match(nodes.get('bank-import-dialog').innerHTML,/אישור 63 תנועות בקבוצה/);
 const table=vm.runInContext("bankGroupRowsView(bankReviewGroups(bankCurrentPreview().rows)[0],[])",c);assert.equal((table.match(/<tr>/g)||[]).length,51);assert.match(table,/תנועות הבאות/);
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'group-row-next',group:'0'}})}})",c);
 assert.equal(vm.runInContext("bankUI.groupRowPages['0']",c),1);assert.equal(vm.runInContext("bankUI.openGroups['0']",c),true);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{field:'personalSaving'})",c),true);
 assert.equal(vm.runInContext('bankUI.monthsConfirmed',c),false);
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'group-approve',group:'0'}})}})",c);
 assert.equal(vm.runInContext('bankCurrentPreview().rows.every(r=>r.reviewed)',c),true);
 assert.equal(vm.runInContext("bankUI.records.slice(0,2).every(r=>bankUI.choices[r.line].field==='variable')",c),true);
 assert.equal(vm.runInContext("bankUI.records.slice(2).every(r=>bankUI.choices[r.line].field==='personalSaving')",c),true);
 assert.equal(vm.runInContext('JSON.stringify(bankUI.records)',c),source);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.equal(requests,0);
 // A per-row exception remains editable after approving the group.
 await vm.runInContext("bankChange({target:{matches:()=>false,dataset:{bankLine:bankUI.records[2].line},value:'transfers'}})",c);
 assert.equal(vm.runInContext('bankCurrentPreview().rows[2].reviewed',c),false);
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'group-approve',group:'0'}})}})",c);
 assert.equal(vm.runInContext('bankCurrentPreview().rows[2].field',c),'transfers');
 vm.runInContext("bankUI.from='2026-02-01';bankUI.to='2026-02-28';bankUI.coverageConfirmed=true;bankUI.monthsConfirmed=true;bankUI.resetConfirmed=true;bankUI.modes={'2026-02':'full'};",c);
 let saved;c.fetch=async(url,options)=>{requests++;saved=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(requests,1);assert.equal(saved.plan.bankImport.entries.length,65);
 assert.equal(new Set(saved.plan.bankImport.entries.map(e=>e.key)).size,65);
 assert.equal(saved.plan.months['2026-02'].values.variable,200.25);assert.equal(saved.plan.months['2026-02'].values.transfers,100.5);
 assert.equal(Math.round(saved.plan.months['2026-02'].values.personalSaving*100),amounts.slice(3).reduce((n,a)=>n+Math.round(a*100),0));
});
test('Mixed group targets require selection, allow clearing, reject wrong direction, and group undo preserves source amounts',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות,לטובת\n12/02/2026,העברה,1,100,,מוטב א\n13/02/2026,העברה,2,250.25,,מוטב א\n14/02/2026,העברה,3,,400,מוטב א');
 vm.runInContext("bankUI.choices[bankUI.records[1].line].field='variable';bankRender();",c);
 assert.match(nodes.get('bank-import-dialog').innerHTML,/יעדים שונים — בחר יעד משותף/);
 assert.match(nodes.get('bank-import-dialog').innerHTML,/data-bank="group-approve" data-group="0" disabled/);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{reviewed:true})",c),false);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{field:'salary'})",c),false);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{field:'transfers'})",c),true);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{field:''})",c),true);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{reviewed:true})",c),false);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{field:'exclude'})",c),true);
 const before=vm.runInContext('JSON.stringify(bankUI.records)',c);
 assert.equal(vm.runInContext("bankGroupUpdate('0',{reviewed:true})",c),true);
 assert.equal(vm.runInContext('bankCurrentPreview().rows[2].reviewed',c),false);
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'group-unreview',group:'0'}})}})",c);
 assert.equal(vm.runInContext('bankCurrentPreview().rows.every(r=>!r.reviewed)',c),true);
 assert.equal(vm.runInContext('JSON.stringify(bankUI.records)',c),before);
});
test('Group approval cannot approve duplicate identities, invalid rows or reference conflicts',async()=>{
 const {c}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות,לטובת\n12/02/2026,העברה,1,100,,מוטב א\n12/02/2026,העברה,1,100,,מוטב א\n13/02/2026,העברה,2,200,,מוטב א\n13/02/2026,העברה,2,300,,מוטב א\n14/02/2026,העברה,3,invalid,,מוטב א');
 const states=vm.runInContext('JSON.stringify(bankCurrentPreview().rows.map(r=>r.state))',c);
 assert.equal(vm.runInContext('bankReviewGroups(bankCurrentPreview().rows)[0].rows.length',c),1);
 const blocked=vm.runInContext('JSON.stringify(bankUI.records.slice(1).map(r=>bankUI.choices[r.line]))',c);
 vm.runInContext("bankGroupUpdate('0',{field:'transfers'});bankGroupUpdate('0',{reviewed:true});",c);
 assert.equal(vm.runInContext('JSON.stringify(bankCurrentPreview().rows.map(r=>r.state))',c),states);
 assert.equal(vm.runInContext('JSON.stringify(bankUI.records.slice(1).map(r=>bankUI.choices[r.line]))',c),blocked);
 assert.equal(vm.runInContext("bankGroupUpdate('99',{reviewed:true})",c),false);
});

test('Bank upload preselects eligible partial/full months and reviewed import saves without choosing every month',async()=>{
 const csv='תאריך,הפעולה,אסמכתא,חובה,זכות,לטובת\n28/02/2026,העברה,1,1000,,מוטב א\n02/03/2026,העברה,2,1200.25,,מוטב א\n01/04/2026,העברה,3,500,,מוטב א';
 const {c,nodes}=await groupedBankClient(csv);
 assert.equal(vm.runInContext("bankUI.modes['2026-02']",c),'partial');assert.equal(vm.runInContext("bankUI.modes['2026-03']",c),'full');assert.equal(vm.runInContext("bankUI.modes['2026-04']",c),'partial');
 assert.match(nodes.get('bank-import-dialog').innerHTML,/החודשים המתאימים כבר נבחרו לקליטה/);
 assert.match(vm.runInContext("bankMonthView(bankCurrentPreview().months[1])",c),/data-bank-month="2026-03" value="intake" checked/);
 const before=vm.runInContext('JSON.stringify(plan)',c);vm.runInContext("bankGroupUpdate('0',{field:'transfers'});bankGroupUpdate('0',{reviewed:true});",c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext('bankUI.coverageConfirmed=true;bankUI.monthsConfirmed=true;bankUI.resetConfirmed=true;',c);
 let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(sent.plan.bankImport.entries.length,3);assert.equal(sent.plan.months['2026-03'].values.transfers,1200.25);assert.equal(sent.plan.months['2026-03'].actual,true);assert.equal(sent.plan.months['2026-02'].actual,false);
});
test('Explicit month skip survives group approval and changing the start month recomputes defaults',async()=>{
 const {c}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות,לטובת\n28/02/2026,העברה,1,100,,מוטב א\n02/03/2026,העברה,2,200,,מוטב א\n01/04/2026,העברה,3,300,,מוטב א');
 await vm.runInContext("bankChange({target:{matches:()=>false,dataset:{bankMonth:'2026-03'},value:'skip'}})",c);
 vm.runInContext("bankGroupUpdate('0',{reviewed:true});",c);assert.equal(vm.runInContext("bankUI.modes['2026-03']",c),'skip');
 await vm.runInContext("bankChange({target:{matches:s=>s==='[data-bank-start]',dataset:{},value:'2026-03'}})",c);
 assert.equal(vm.runInContext("bankUI.modes['2026-02']",c),'skip');assert.equal(vm.runInContext("bankUI.modes['2026-03']",c),'full');assert.equal(vm.runInContext('bankUI.monthsConfirmed',c),false);
});

test('Simple bank-first review hides unnecessary planned-payment choices and final button saves approved data',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n28/02/2026,העברה,1,100,\n02/03/2026,העברה,2,200,\n01/04/2026,העברה,3,300,');
 const html=nodes.get('bank-import-dialog').innerHTML;
 assert.doesNotMatch(html,/data-bank-direct|data-bank-months-confirm|data-bank-coverage/);
 assert.match(html,/קליטת נתוני הבנק ושמירה בתקציב/);assert.match(html,/value="complete" checked/);
 vm.runInContext("bankGroupUpdate('0',{reviewed:true});bankUI.resetConfirmed=true;",c);
 let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(sent.plan.bankImport.entries.length,3);assert.equal(sent.plan.months['2026-03'].values.transfers,200);
});
test('Actual planned payments show two explicit alternatives with real examples and block saving until one is selected',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n28/02/2026,העברה,1,1000,');
 vm.runInContext("bankUI.base.expenses=[{id:'insurance',name:'ביטוח רכב',amount:500,fees:0,firstMonth:'2026-02',payments:1,kind:'expense',source:'direct'}];bankGroupUpdate('0',{reviewed:true});bankUI.resetConfirmed=true;bankRender();",c);
 const html=nodes.get('bank-import-dialog').innerHTML;
 assert.match(html,/התכנון כבר כלול בדוח הבנק/);assert.match(html,/התכנון עדיין נוסף לדוח הבנק/);assert.match(html,/ביטוח רכב/);assert.match(html,/500/);
 assert.equal((html.match(/type="radio" name="bank-direct-2026-02"/g)||[]).length,2);assert.doesNotMatch(html,/type="checkbox"[^>]*data-bank-direct/);
 let calls=0,sent;c.fetch=async(url,options)=>{calls++;sent=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);assert.equal(calls,0);assert.match(vm.runInContext('bankUI.error',c),/תכנון קיים/);
 await vm.runInContext("bankChange({target:{matches:()=>false,dataset:{bankDirect:'2026-02'},value:'included'}})",c);
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);assert.equal(calls,1);assert.equal(sent.plan.months['2026-02'].includesPlannedDirect,true);
});
test('Choosing a filtered statement changes full months to partial intake without unreviewing mapped transactions',async()=>{
 const {c}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n28/02/2026,העברה,1,100,\n02/03/2026,העברה,2,200,\n01/04/2026,העברה,3,300,');
 vm.runInContext("bankGroupUpdate('0',{reviewed:true});",c);
 const choices=vm.runInContext('JSON.stringify(bankUI.choices)',c);
 await vm.runInContext("bankChange({target:{matches:s=>s==='[data-bank-scope]',dataset:{},value:'partial'}})",c);
 assert.equal(vm.runInContext("bankUI.modes['2026-03']",c),'partial');assert.equal(vm.runInContext('JSON.stringify(bankUI.choices)',c),choices);
});

test('Import errors appear immediately beside the apply button and success explicitly closes and opens Home at the top',async()=>{
 const {c,nodes,app}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,העברה,1,100,');
 let scrolled=0,closed=0;nodes.get('bank-import-dialog').querySelector=selector=>selector==='[data-bank-save-error]'?{scrollIntoView(){scrolled++;}}:null;nodes.get('bank-import-dialog').close=()=>{closed++;};
 vm.runInContext("bankGroupUpdate('0',{reviewed:true});",c);let sent=0;c.fetch=async()=>{sent++;return{ok:true,json:async()=>({revision:4})};};
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 const html=nodes.get('bank-import-dialog').innerHTML;
 assert.equal(sent,0);assert.ok(html.indexOf('data-bank-save-error')>html.indexOf('3. החודשים'));assert.ok(html.indexOf('data-bank-save-error')<html.indexOf('data-bank="apply"'));assert.equal(scrolled,1);
 vm.runInContext("bankUI.resetConfirmed=true;tab='settings';",c);c.document.scrollingElement.scrollTop=750;
 await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(sent,1);assert.equal(closed,1);assert.equal(vm.runInContext('bankUI',c),null);assert.equal(vm.runInContext('tab',c),'progress');assert.equal(c.document.scrollingElement.scrollTop,0);assert.match(app.innerHTML,/<h1>סטטוס<\/h1>/);
});
test('Bank savings deposits remain visible while unknown savings balance is not presented as zero',async()=>{
 const {c,app}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,העברה לחיסכון,1,1000.25,');
 vm.runInContext("bankUI.choices[bankUI.records[0].line]={field:'personalSaving',reviewed:true};bankUI.resetConfirmed=true;",c);
 c.fetch=async()=>({ok:true,json:async()=>({revision:4})});await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 const before=vm.runInContext('JSON.stringify(plan)',c);assert.match(app.innerHTML,/טרם דווחה/);assert.match(app.innerHTML,/העברות לחיסכון נקלטו מהבנק/);assert.match(app.innerHTML,/1,000.25/);assert.doesNotMatch(app.innerHTML,/המטרות שלי/);vm.runInContext("tab='goals';render()",c);assert.match(app.innerHTML,/אין צורך להזין אותן שוב/);assert.doesNotMatch(app.innerHTML,/צפייה בדוגמה מלאה/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 assert.match(app.innerHTML,/data-save-footer/);assert.match(app.innerHTML,/שמירת החיסכון והמטרה/);
});
test('Savings goal and allocation dialogs provide explicit save footers and investments are grouped by account without changing keys',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;',c);
 assert.match(vm.runInContext('savingsNewGoalDialog()',c),/data-save-footer/);assert.match(vm.runInContext('savingsAllocationDialog()',c),/data-save-footer/);
 const monthly=vm.runInContext('monthlyView()',c);assert.match(monthly,/<legend>חשבון פרטי<\/legend>/);assert.match(monthly,/<legend>חשבון משותף<\/legend>/);assert.match(monthly,/name="month-personalInvest"/);assert.match(monthly,/name="month-sharedInvest"/);assert.doesNotMatch(monthly,/השקעה אישית|השקעה משותפת/);
 assert.match(vm.runInContext('savingsHomeView()',c),/הוספת מטרה נוספת/);
});
test('Visible form save footer replaces the floating save dock and preserves allocation disabled state across save',()=>{
 const {c}=client(),footer={dataset:{saveLabel:'שמירת החלוקה'},disabled:true,textContent:''};let removed=0;
 const oldGet=c.document.getElementById;c.document.getElementById=id=>id==='save-changes-dock'?{remove(){removed++;}}:oldGet(id);c.document.querySelectorAll=selector=>selector==='dialog[open] [data-save-footer],#savings-home form [data-save-footer],[data-cash-form] [data-save-footer]'?[{getClientRects:()=>[]},footer]:[];
 c.document.createElement=()=>{throw Error('no floating dock should be created');};c.document.body={classList:{remove(){},add(){}}};
 vm.runInContext('saving=true;saveDockUpdate()',c);assert.equal(footer.disabled,true);assert.equal(footer.textContent,'שומר…');
 vm.runInContext('saving=false;saveDockUpdate()',c);assert.equal(footer.disabled,true);assert.equal(footer.textContent,'שמירת החלוקה');assert.equal(removed,2);
});

test('Savings balance setup covers bank-reported deposits already included in the entered balance',()=>{
 const {c}=client();vm.runInContext("savingsTransfer=null;delete plan.savingsGoals;plan.months['2026-10']={values:{...zero(),personalSaving:1000.25,sharedSaving:500},actual:true,includesPlannedCard:false};",c);
 c.budgetFormData=()=>new Map([['month','2026-10'],['goalName','בית'],['target','50000'],['allocated','0'],['icon','house']]);c.savingsReadAccounts=()=>[{id:'a',name:'חיסכון',balance:25000}];c.form={dataset:{sgForm:'pool'}};
 vm.runInContext('savingsSubmit(form)',c);assert.equal(vm.runInContext("savingsBalances(plan,'2026-10').balance",c),25000);
 vm.runInContext("plan=confirmMonthlySavings(plan,'2026-10','2026-10');",c);assert.equal(vm.runInContext("savingsBalances(plan,'2026-10').balance",c),25000);assert.equal(vm.runInContext('plan.months["2026-10"].values.personalSaving',c),1000.25);
});
test('Bank picker offers distinct providers and cannot relabel an already imported account as a different bank',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,משכורת,1,,1000');
 assert.match(nodes.get('bank-import-dialog').innerHTML,/value="one-zero"/);assert.match(nodes.get('bank-import-dialog').innerHTML,/וואן זירו/);
 vm.runInContext("bankUI.resetConfirmed=true;bankUI.bankName='one-zero';",c);let sent;c.fetch=async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(sent.plan.bankImport.accounts[0].bankName,'one-zero');assert.equal(sent.plan.months['2026-02'].values.salary,1000);
});

test('One Zero XLS upload reads through full Excel worker, preserves cents and saves account identity',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,סכום\n12/03/2026,-100');
 c.Worker=class{listeners=new Map();addEventListener(t,cb){this.listeners.set(t,cb);}removeEventListener(t){this.listeners.delete(t);}terminate(){}postMessage(data){assert.equal(data.format,'xls');const workbook=readExcel(new Uint8Array(data.bytes),XLSFull,data.format),sheets=listSheets(workbook),selected=sheets[0].name;Promise.resolve().then(()=>this.listeners.get('message')?.({data:{id:data.id,sheets,selected,inspection:inspectSheet(workbook,selected,XLSFull)}}));}};
 c.file=new File([xlsFixture()],'one-zero-synthetic.xls');await vm.runInContext('bankLoadFile(file)',c);
 assert.equal(vm.runInContext('bankUI.error',c),'');assert.equal(vm.runInContext('bankUI.inspection.format',c),'xls');assert.equal(vm.runInContext('bankUI.records[0].amountCents',c),-100025);assert.match(nodes.get('bank-import-dialog').innerHTML,/\.xls/);
 vm.runInContext("bankUI.bankName='one-zero';bankUI.resetConfirmed=true;for(const r of bankUI.records)bankUI.choices[r.line]={field:r.amountCents<0?'personalSaving':'salary',reviewed:true};",c);
 let saved;c.fetch=async(url,options)=>{saved=JSON.parse(options.body);return{ok:true,json:async()=>({revision:4})};};await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);
 assert.equal(saved.plan.bankImport.accounts[0].bankName,'one-zero');assert.equal(saved.plan.months['2026-03'].values.personalSaving,1000.25);assert.equal(saved.plan.months['2026-03'].values.salary,2000.5);
});
function cashClientPlan(c){vm.runInContext("savingsTransfer=null;savingsReset();purchase={name:'',amount:0,fees:0,firstMonth:'2026-10',source:'direct'};scenarioItems=[];plan={startMonth:'2026-10',opening:9100,buffer:0,horizon:12,defaults:{...zero(),salary:2000},months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'הפועלים — פרטי',opening:100,buffer:0,defaults:{...zero(),salary:1000}},{id:'b',label:'וואן זירו — משותף',opening:9000,buffer:0,defaults:{...zero(),salary:1000}}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}};cashSync();cashUI.selected='a';selectedMonth='2026-10';dirty=false;",c);}
test('Bank tabs display only the selected account, with its cards and monthly values; raw cash edits guard navigation',()=>{
 const {c}=client();cashClientPlan(c);const home=vm.runInContext('cashHomeView()',c);assert.match(home,/role="tablist"/);assert.match(home,/aria-selected="true"[^>]*data-cash-tab="a"/);assert.match(home,/1,100/);assert.doesNotMatch(home,/>10,000/);
 vm.runInContext("cashUI.selected='b'",c);const month=vm.runInContext('cashMonthView()',c);assert.match(month,/10,000/);assert.match(month,/cash-value-card2/);assert.doesNotMatch(month,/cash-value-card1/);assert.match(month,/שמירת החודש בחשבון/);
 vm.runInContext('cashUI.dirty=true',c);assert.equal(vm.runInContext('hasSavingsDraft()',c),true);assert.equal(vm.runInContext('guardSavingsDraft()',c),false);
});
test('Payment calendar identifies the paying bank overdraft even when combined cash is positive',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext("purchase={name:'מחשב',amount:1500,fees:0,firstMonth:'2026-10',source:'card',cashAccountId:'a',cardId:'card1'};selectedPayments=1;",c);
 const calendar=vm.runInContext('paymentCalendar()',c);assert.match(calendar,/הפועלים — פרטי/);assert.match(calendar,/-400/);assert.match(calendar,/וואן זירו — משותף/);assert.doesNotMatch(calendar,/10,000/);assert.match(calendar,/חלופה בחשבון אחר/);assert.match(calendar,/8,500/);assert.match(calendar,/payment-negative/);assert.match(vm.runInContext('trialCard(trialDrafts()[0],0)',c),/cashAccountId/);
});
test('Per-account month edits persist through the authenticated revision-aware save and never erase another account',async()=>{
 const {c}=client();cashClientPlan(c);const initial=vm.runInContext('JSON.stringify(plan)',c);let request;
 c.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({revision:4})};};
 c.budgetFormData=()=>new Map([['cash-value-salary','1100.25'],['cash-balance','-25.50'],['cash-actual','actual']]);
 c.form={dataset:{cashForm:'month'},reportValidity:()=>true,elements:{namedItem:name=>name==='cash-value-salary'||name==='cash-balance'?{dataset:{current:'0'}}:null},querySelector:()=>({hidden:true,textContent:'',scrollIntoView(){}})};
 vm.runInContext('cashUI.dirty=true;cashSubmit(form)',c);assert.equal(vm.runInContext('hasCashDraft()',c),false);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('plan.cashPlanning.months["2026-10"].a.balance',c),-25.5);assert.equal(vm.runInContext('plan.months["2026-10"].values.salary',c),2100.25);
 assert.equal(vm.runInContext('JSON.stringify(plan.cashPlanning.accounts[1])',c),JSON.stringify(JSON.parse(initial).cashPlanning.accounts[1]));
 await vm.runInContext('save()',c);assert.equal(request.body.revision,3);assert.equal(request.body.plan.cashPlanning.months['2026-10'].a.values.salary,1100.25);assert.equal(vm.runInContext('revision',c),4);
});
test('An untouched opening input cannot invent a zero bank balance and cash planning remains private on save failure',async()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext('delete plan.cashPlanning.accounts[0].opening;delete plan.cashPlanning.accounts[0].openingMonth;',c);
 c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','אישי'],['cash-buffer','100'],['cash-opening',''],['cash-opening-month','2026-10'],['cash-card-card1','a'],['cash-card-card2','b']]);
 c.form={dataset:{cashForm:'config'},reportValidity:()=>true,elements:{namedItem:()=>({dataset:{current:'0'}})},querySelector:()=>({hidden:true,textContent:'',scrollIntoView(){}})};
 vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext('plan.cashPlanning.accounts.find(a=>a.id==="a").opening',c),undefined);
 c.fetch=async()=>({ok:false,json:async()=>({error:'revision conflict'})});await vm.runInContext('save()',c);assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('revision',c),3);assert.equal(vm.runInContext('plan.cashPlanning.accounts.find(a=>a.id==="a").label',c),'אישי');
});
test('Saving account fields preserves card links absent from an older form; an explicit empty selection still clears its own link',()=>{
 const {c}=client();cashClientPlan(c);c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','הפועלים'],['cash-buffer','0'],['cash-opening',''],['cash-opening-month','2026-10']]);c.form={dataset:{cashForm:'config'},reportValidity:()=>true,elements:{namedItem:()=>({dataset:{current:'0'}})},querySelector:()=>({hidden:true,textContent:'',scrollIntoView(){}})};
 vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext('plan.cashPlanning.cardAccounts.card1',c),'a');assert.equal(vm.runInContext('plan.cashPlanning.cardAccounts.card2',c),'b');c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','הפועלים'],['cash-buffer','0'],['cash-opening',''],['cash-opening-month','2026-10'],['cash-card-card1','']]);vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext('plan.cashPlanning.cardAccounts.card1',c),undefined);assert.equal(vm.runInContext('plan.cashPlanning.cardAccounts.card2',c),'b');
});
test('Cash form drafts are keyed by account and month; accepting a report removes its raw form before switching banks',()=>{
 const {c}=client();cashClientPlan(c);c.a={id:'cash-month-form',dataset:{cashForm:'month',cashAccount:'a',cashMonth:'2026-10',saveDockEdited:'true'}};c.b={id:'cash-month-form',dataset:{cashForm:'month',cashAccount:'b',cashMonth:'2026-10'}};
 assert.notEqual(vm.runInContext('saveDockKey(a)',c),vm.runInContext('saveDockKey(b)',c));
 c.b.dataset.cashAccount='a';c.b.dataset.cashMonth='2026-11';assert.notEqual(vm.runInContext('saveDockKey(a)',c),vm.runInContext('saveDockKey(b)',c));
 vm.runInContext('saveDockEditors.set(saveDockKey(a),a);saveDockDrop(a)',c);assert.equal(vm.runInContext('saveDockEditors.size',c),0);assert.equal(c.a.dataset.saveDockEdited,undefined);
});

test('One Zero PDF upload verifies totals, keeps complete document coverage, requires cancellation mapping and persists net expenses',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,סכום\n12/03/2026,-100');const inspection=inspectOneZeroPDF(pdfTextFixture());
 c.Worker=class{listeners=new Map();addEventListener(t,cb){this.listeners.set(t,cb);}removeEventListener(t){this.listeners.delete(t);}terminate(){}postMessage(data){assert.equal(data.action,'bank-pdf');Promise.resolve().then(()=>this.listeners.get('message')?.({data:{id:data.id,inspection}}));}};
 c.file=new File([pdfFixture()],'one-zero-synthetic.pdf');await vm.runInContext('bankLoadFile(file)',c);assert.equal(vm.runInContext('bankUI.error',c),'');assert.equal(vm.runInContext('bankUI.bankName',c),'one-zero');assert.equal(vm.runInContext('bankUI.from',c),'2026-01-01');assert.equal(vm.runInContext('bankUI.to',c),'2026-01-31');assert.equal(vm.runInContext('bankUI.base.opening',c),100);assert.equal(vm.runInContext('bankUI.records[1].reversal',c),true);assert.equal(vm.runInContext('bankUI.choices[3].reviewed',c),false);assert.match(nodes.get('bank-import-dialog').innerHTML,/סיכומי PDF אומתו/);
 vm.runInContext("bankUI.resetConfirmed=true;for(const r of bankUI.records)bankUI.choices[r.line]={field:r.amountCents>1000?'salary':'variable',reviewed:true};",c);let saved;c.fetch=async(url,options)=>{saved=JSON.parse(options.body);return {ok:true,json:async()=>({revision:4})};};await vm.runInContext("bankClick({target:{closest:()=>({dataset:{bank:'apply'}})}})",c);assert.equal(saved.plan.months['2026-01'].values.variable,0);assert.equal(saved.plan.months['2026-01'].values.salary,1200.25);assert.equal(saved.plan.months['2026-01'].cashReport.balance,1300.25);assert.equal(saved.plan.bankImport.entries[1].cents,1000);assert.equal(saved.plan.bankImport.entries.length,3);
});
test('Incoming review lists cards, savings and loans with refund labels and requires reapproval after changing its target',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,חיוב,1,100,\n13/02/2026,זיכוי,2,,25');const html=nodes.get('bank-import-dialog').innerHTML;
 assert.match(html,/כרטיס וואן זירו · זיכוי בכרטיס/);assert.match(html,/חיסכון אישי · החזר שמפחית מהפקדות החודש/);assert.match(html,/החזר הלוואות · ביטול או החזר של תשלום הלוואה/);
 const group=vm.runInContext('bankReviewGroups(bankCurrentPreview().rows).find(g=>g.direction==="in").id',c);c.group=group;assert.equal(vm.runInContext("bankGroupUpdate(group,{field:'card2'})",c),true);assert.equal(vm.runInContext('bankUI.choices[3].reviewed',c),false);assert.equal(vm.runInContext('bankUI.choices[3].refund',c),true);assert.equal(vm.runInContext('bankGroupUpdate(group,{reviewed:true})',c),true);
 vm.runInContext("bankUI.choices[2]={field:'card2',reviewed:true};",c);assert.equal(vm.runInContext("bankCurrentPreview().months[0].values.card2",c),7500);
 vm.runInContext("bankUI.reviewFilter='all'",c);assert.match(vm.runInContext('bankGroupsView(bankReviewGroups(bankCurrentPreview().rows),bankCurrentPreview(),[...budgetFields(bankWorkingPlan()),["exclude","ללא השפעה"]])',c),/עריכת הסיווג ואישורי הקבוצה/);
});
test('Outgoing review keeps all targets visible and labels incompatible income choices without allowing them',async()=>{
 const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,העברה,1,100,');assert.match(nodes.get('bank-import-dialog').innerHTML,/value="salary"[^>]*disabled>הכנסה נטו · מתאים לזיכוי בלבד/);assert.equal(vm.runInContext("bankGroupUpdate('0',{field:'salary'})",c),false);assert.match(nodes.get('bank-import-dialog').innerHTML,/החזר הלוואות/);
});

test('Pending-only review removes accepted groups, retains all-view editing, and selecting a target confirms the group once',async()=>{const {c,nodes}=await groupedBankClient('תאריך,הפעולה,אסמכתא,חובה,זכות\n12/02/2026,בדיקה מיוחדת,1,100,\n13/02/2026,בדיקה מיוחדת,2,250,');await vm.runInContext("bankChange({target:{dataset:{bankGroupField:'0'},value:'card2',matches:()=>false}})",c);assert.equal(vm.runInContext('bankCurrentPreview().rows.every(r=>r.reviewed&&r.field==="card2")',c),true);assert.match(nodes.get('bank-import-dialog').innerHTML,/כל הקבוצות סווגו/);assert.doesNotMatch(nodes.get('bank-import-dialog').innerHTML,/<h4>בדיקה מיוחדת/);vm.runInContext("bankUI.reviewFilter='all';bankRender()",c);assert.match(nodes.get('bank-import-dialog').innerHTML,/<h4>בדיקה מיוחדת/);assert.match(nodes.get('bank-import-dialog').innerHTML,/עריכת הסיווג ואישורי הקבוצה/);});
test('Home shows individual account forecasts without a duplicate aggregate tile',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.opening=-31649.51;plan.defaults=zero();plan.cashPlanning.accounts[0].opening=8765.58;plan.cashPlanning.accounts[1].opening=2226.14;for(const a of plan.cashPlanning.accounts)a.defaults=zero();plan.expenses=[]",c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);const html=vm.runInContext('homeView()',c);assert.ok(!html.includes(vm.runInContext('money(10991.72)',c)));assert.ok(html.includes(vm.runInContext('money(8765.58)',c)));assert.ok(html.includes(vm.runInContext('money(2226.14)',c)));assert.ok(!html.includes(vm.runInContext('money(-31649.51)',c)));assert.doesNotMatch(html,/מצב היתרות|status-cash/);assert.doesNotMatch(html,/יש לעדכן את היתרה בפועל מהבנק/);});

test('Verified PDF chooses the unique One Zero account without mixing it into Hapoalim',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.cashPlanning.accounts[0].bankName='hapoalim';plan.cashPlanning.accounts[1].bankName='one-zero';bankUI={accountId:'a',bankName:'hapoalim'};bankSelectPDFAccount(bankUI)",c);assert.equal(vm.runInContext('bankUI.accountId',c),'b');assert.match(vm.runInContext('bankUI.accountNotice',c),/וואן זירו/);vm.runInContext("plan.cashPlanning.accounts.push({id:'c',label:'נוסף',bankName:'one-zero',buffer:0});bankUI.accountId='a'",c);assert.throws(()=>vm.runInContext('bankSelectPDFAccount(bankUI)',c),/בחר/);assert.equal(vm.runInContext('bankUI.accountId',c),'a');});

test('Spending page always shows current and previous card totals, including disabled category details and custom cards',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.showDetails=false;plan.creditCards=[{id:'card1',name:'הייטקזון',alias:''},{id:'card2',name:'וואן זירו',alias:''},{id:'card_custom',name:'כרטיס נוסף',alias:''}];plan.defaults.card_custom=0;plan.months['2026-09']={values:{...zero(),card1:1000.25,card2:0,card_custom:25},actual:true,includesPlannedCard:false};plan.cardBilling={version:1,reports:[{cardId:'card1',accountId:'a',dueDate:'2026-10-15',updatedOn:'2026-10-14',amount:2000.5,status:'pending',source:'manual'}]};",c);const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext('detailsView()',c);assert.match(html,/detail-cards-track/);assert.match(html,/כרטיס נוסף/);assert.match(html,/חיוב נוכחי/);assert.match(html,/חיוב קודם/);assert.match(html,/גלילה לכרטיסים מימין/);assert.match(html,/גלילה לכרטיסים משמאל/);assert.ok(html.includes(vm.runInContext('money(2000.5)',c)));assert.ok(html.includes(vm.runInContext('money(1000.25)',c)));assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);});

test('Five requested tabs keep status, expenses and goals separate without altering the budget',()=>{const {c,app}=client();cashClientPlan(c);vm.runInContext("tab='progress';render()",c);const before=vm.runInContext('JSON.stringify(plan)',c),nav=app.innerHTML.match(/<nav class="tabs"[\s\S]*?<\/nav>/)[0];assert.deepEqual([...nav.matchAll(/<span>(.*?)<\/span>/g)].map(m=>m[1]),['סטטוס','הוצאות','מטרות','מחשבון','נתונים']);const status=vm.runInContext('homeView()',c);assert.match(status,/home-savings-tile/);assert.doesNotMatch(status,/מצב היתרות|status-cash/);assert.doesNotMatch(status,/חיובי כרטיסים לפי חשבון|מגמות בולטות|status-insights/);assert.doesNotMatch(status,/המטרות שלי|<h2>מצב הכרטיסים<\/h2>|העלאת דוח מהבנק/);assert.match(vm.runInContext('goalsView()',c),/id="savings-home"/);assert.doesNotMatch(vm.runInContext('goalsView()',c),/המטרות שלי|חלוקת החיסכון הקיים בין המטרות/);vm.runInContext("selectedMonth='2026-10'",c);const expenses=vm.runInContext('expensesView()',c);assert.match(expenses,/מצב הכרטיסים/);assert.doesNotMatch(expenses,/החלוקה לפי קטגוריות|expense-analytics|הפעלת פירוט|הצ׳קים/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);});
test('Expenses card history shows last two known months rather than forcing the current and previous month',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.months['2026-08']={values:{...zero(),card1:800},actual:true,includesPlannedCard:false};plan.months['2026-06']={values:{...zero(),card1:600},actual:true,includesPlannedCard:false};plan.months['2026-05']={values:{...zero(),card1:500},actual:true,includesPlannedCard:false};",c);const html=vm.runInContext('expenseCardHistoryView()',c);assert.match(html,/נתוני החודש הנוכחי עוד לא עודכנו/);assert.match(html,/מרכז הדוחות או הזנה ועריכה ידנית/);assert.ok(html.includes(vm.runInContext('money(800)',c)));assert.ok(html.includes(vm.runInContext('money(600)',c)));assert.ok(!html.includes(vm.runInContext('money(500)',c)));});
test('Expenses categories appear before cards only with selected-month data, with inline category disclosure and a separate trend action',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.details=[{id:'qa',month:'2026-10',date:'2026-10-10',name:'בדיקה',category:'מזון',method:'card1',amount:50,accounting:'included',status:'cleared',number:''}];plan.showDetails=true;",c);const html=vm.runInContext('expensesView()',c);assert.ok(html.indexOf('חלוקה לפי קטגוריה')<html.indexOf('מצב הכרטיסים'));assert.match(html,/data-category-disclosure/);assert.doesNotMatch(html,/id="category-trend"|הצ׳קים/);});

test('Status balance summaries stay clickable without a pending-card tile',()=>{const {c}=client();cashClientPlan(c);vm.runInContext("plan.cardBilling={version:1,reports:[{cardId:'card1',accountId:'a',dueDate:'2026-10-15',updatedOn:'2026-10-14',amount:1200,status:'pending',source:'manual'},{cardId:'card2',accountId:'b',dueDate:'2026-10-15',updatedOn:'2026-10-14',amount:300,status:'pending',source:'manual'}]};",c);const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext('homeView()',c);assert.doesNotMatch(html,/מצב היתרות|status-cash/);assert.match(html,/home-savings-tile/);assert.doesNotMatch(html,/חיובי כרטיסים שעוד צפויים|status-expenses/);assert.match(html,/הפועלים — פרטי/);assert.match(html,/וואן זירו — משותף/);assert.doesNotMatch(html,/טרם נכלל בדוח/);assert.doesNotMatch(html,/class="status-accounts"/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);});

test('Status keeps account details collapsed and shows savings in its own last tile',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);
 const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext('homeView()',c);
 assert.doesNotMatch(html,/מצב היתרות|status-cash/);assert.match(html,/החשבונות שלי/);assert.match(html,/החיסכון שלי/);
 assert.ok(html.indexOf('home-savings-tile')>html.indexOf('wallet-account-section'));
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:[\s=>])/);assert.match(html,/data-tab="goals"/);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Wallet presentation preserves bank snapshots, source labels and unknown card amounts without mutations',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);
 const before=vm.runInContext('JSON.stringify(plan)',c),banks=vm.runInContext("walletBankAccountsView(statusAccountSummaries(plan,todayMonth(),'2026-10-14'),todayMonth())",c);
 assert.match(banks,/wallet-banks/);assert.match(banks,/יתרת פתיחה/);assert.doesNotMatch(banks,/דווח מהבנק:/);assert.match(banks,/כרטיס 2 מתוך 2/);
 const cards=vm.runInContext('walletCreditCardsView()',c);assert.match(cards,/wallet-credit/);assert.match(cards,/טרם עודכן/);assert.doesNotMatch(cards,/data-action="billing-update"/);assert.match(cards,/data-wallet-index="1"/);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Wallet keeps actual zero charge readable, escapes card names and places categories before cards',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);
 vm.runInContext("plan.months[todayMonth()]={values:zero(),actual:true,includesPlannedCard:true};plan.creditCards=[{id:'card1',name:'<img src=x>',alias:''}];plan.details=[{id:'wallet-food',month:todayMonth(),date:todayMonth()+'-10',name:'מזון',category:'מזון',method:'card1',amount:0,accounting:'included',status:'cleared',number:''}];plan.showDetails=true;",c);
 const card=vm.runInContext('walletCreditCardsView()',c);assert.match(card,/&lt;img src=x&gt;/);assert.ok(card.includes(vm.runInContext('money(0)',c)));assert.doesNotMatch(card,/<img src=x>/);
});


test('Category charts retain zero-net details and show signed refunds without invalid negative pie segments',()=>{
 const {c}=client();
 const html=vm.runInContext("expenseCharts({categories:[{category:'מזון',amount:25},{category:'קניות',amount:-25}],recorded:0,unexplained:0,over:false},false)",c);
 assert.match(html,/זיכוי נטו/);assert.doesNotMatch(html,/הוספת פרטי הוצאות תציג|spending-donut|width:-/);assert.match(html,/קניות/);
});

test('Category donut uses imported detail only, with forecast remainder in a separate closed explanation',()=>{
 const {c}=client();cashClientPlan(c);
 vm.runInContext("selectedMonth='2026-11';plan.details=[{month:selectedMonth,statement:{issuer:'cal'}}]",c);
 const html=vm.runInContext("expenseCharts({categories:[{category:'קניות',amount:360.5},{category:'בילויים',amount:254.66}],recorded:615.16,unexplained:8178.65,planned:100,over:false,groups:[{label:'הוצאות אחרות',unexplained:8078.65}]},false)",c);
 const donut=html.match(/<div class="spending-donut"[\s\S]*?<\/small>|<div class="spending-donut"[\s\S]*?<\/div><\/div>/)[0];
 assert.doesNotMatch(donut,/ללא פירוט|8178|8,178|var\(--muted\)/);assert.ok(donut.includes(vm.runInContext('money(615.16)',c)));
 assert.match(html,/מועד חיוב עתידי · פירוט שנקלט/);assert.match(html,/<details class="expense-unexplained"><summary>/);assert.match(html,/אומדנים מחודשים קודמים/);assert.match(html,/הוצאות אחרות/);
});

test('Hierarchical category picker preserves custom labels and chart child detail starts collapsed',()=>{
 const {c}=client();const html=vm.runInContext(`categoryOptions(['מזון','מזון / סופר ומכולת','מזון / מסעדות ובתי קפה','מותאם <אישי>'],'מזון / סופר ומכולת')`,c);
 assert.match(html,/<optgroup label="מזון">/);assert.match(html,/value="מזון \/ סופר ומכולת" selected/);assert.match(html,/מותאם &lt;אישי&gt;/);
 const chart=vm.runInContext(`categoryBars({categories:[{category:'מזון',amount:10},{category:'מזון / סופר ומכולת',amount:20.25}]},false)`,c);
 assert.match(chart,/<details class="category-children">/);assert.doesNotMatch(chart,/<details[^>]*open/);assert.ok(chart.includes(vm.runInContext('money(30.25)',c)));
});

test('Expenses show explicit annual missing statement months without November/December in October, with manual-data distinction',()=>{
 const {c}=client();vm.runInContext(`plan.startMonth='2026-01';plan.creditCards=[{id:'card1',name:'כרטיס לדוגמה',alias:''}];plan.details=[];plan.cardBilling={version:1,reports:Array.from({length:10},(_,i)=>i+1).filter(m=>![3,4].includes(m)).map(m=>({cardId:'card1',accountId:'a',dueDate:'2026-'+String(m).padStart(2,'0')+'-15',source:'file'}))};`,c);
 const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext('cardStatementCoverageView()',c);assert.match(html,/מרץ/);assert.match(html,/אפריל/);assert.match(html,/חסרים 2 דוחות/);assert.doesNotMatch(html,/נובמבר|דצמבר/);assert.match(html,/הסכום עודכן ידנית|סכום שהוזן ידנית/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.match(vm.runInContext('expensesView()',c),/דוחות האשראי לשנה/);
});
test('Gentle expense trends keep missing months as gaps and deferred categorization stays optional and directly reachable',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(`plan.startMonth='2026-01';plan.details=[{id:'one',name:'חנות',amount:10,category:'לסיווג',method:'card1',month:'2026-08',date:'2026-08-01',number:'',status:'cleared',accounting:'included'},{id:'two',name:'חנות',amount:20,category:'מזון',method:'card1',month:'2026-10',date:'2026-10-01',number:'',status:'cleared',accounting:'included'}];`,c);
 const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext("expensePulseView('2026-10')",c);assert.match(html,/הוצאות לפי חודש/);assert.match(html,/expense-pulse-gap/);assert.match(html,/מידע חלקי/);assert.doesNotMatch(html,/לעומת החודש הקודם|כל הכבוד/);assert.match(vm.runInContext('deferredCategoriesLink()',c),/data-month="2026-08"/);
 vm.runInContext("detailAction('deferred-categories',{dataset:{month:'2026-08'}})",c);assert.equal(vm.runInContext('selectedMonth',c),'2026-08');assert.match(vm.runInContext('deferredCategoriesView()',c),/אפשר גם אחר כך/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Expenses zero-month action confirms the specific card/month, supports cancel and undo, and saves with revision checks',async()=>{
 const {c,prompt,promptNodes,notice}=client();cashClientPlan(c);vm.runInContext("plan.startMonth='2026-01';tab='details';",c);const original=vm.runInContext('JSON.stringify(plan)',c);
 assert.match(vm.runInContext('cardStatementCoverageView()',c),/data-action="card-no-transactions"[^>]*data-month="2026-03"/);
 vm.runInContext("detailAction('card-no-transactions',{dataset:{card:'card1',month:'2026-03'}})",c);assert.equal(prompt.open,true);assert.match(promptNodes.get('#confirm-text').textContent,/מרץ|2026/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),original);
 promptNodes.get('#confirm-cancel').onclick();assert.equal(vm.runInContext('JSON.stringify(plan)',c),original);
 vm.runInContext("detailAction('card-no-transactions',{dataset:{card:'card1',month:'2026-03'}})",c);promptNodes.get('#confirm-yes').onclick();assert.equal(vm.runInContext('dirty',c),true);assert.match(vm.runInContext('cardStatementCoverageView()',c),/ללא עסקאות וחיובים · אושר ידנית/);assert.match(vm.runInContext('cardStatementCoverageView()',c),/card-no-transactions-undo/);
 let request;c.fetch=async(url,options)=>{request=JSON.parse(options.body);return{ok:false,json:async()=>({error:'conflict'})};};await vm.runInContext('save()',c);assert.equal(request.revision,3);assert.equal(request.plan.cardBilling.reports[0].amount,0);assert.equal(vm.runInContext('dirty',c),true);assert.match(notice.textContent,/conflict/);
 c.fetch=async()=>({ok:true,json:async()=>({revision:4})});await vm.runInContext('save()',c);assert.equal(vm.runInContext('dirty',c),false);
 vm.runInContext("detailAction('card-no-transactions-undo',{dataset:{card:'card1',month:'2026-03'}})",c);promptNodes.get('#confirm-yes').onclick();assert.equal(vm.runInContext("cardNoTransactionsConfirmed(plan,'card1','2026-03')",c),false);assert.equal(vm.runInContext('dirty',c),true);
});

test('Expense month picker includes current and deliberately selected months beyond the original short forecast',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext("plan.startMonth='2024-01';plan.horizon=12;plan.expenses=[];plan.details=[];todayMonth=()=> '2026-10';selectedMonth='2026-10';",c);
 const options=vm.runInContext('detailMonthOptions()',c);assert.ok(options.some(([month])=>month==='2026-10'));assert.doesNotMatch(vm.runInContext('cashMonthView()',c),/חסרה יתרת פתיחה/);
 vm.runInContext("selectedMonth='2027-03'",c);assert.ok(vm.runInContext('detailMonthOptions()',c).some(([month])=>month==='2027-03'));assert.equal(vm.runInContext('plan.horizon',c),12);assert.equal(vm.runInContext('plan.startMonth',c),'2024-01');
});

test('Manual entry hub groups existing financial forms without mutating the budget; reports remain the primary menu entry',()=>{
 const {c,app}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];tab="details"',c);const before=vm.runInContext('JSON.stringify(plan)',c);
 vm.runInContext(fs.readFileSync('src/planning-insights-client.js','utf8'),c);c.statusInsights=()=>({rows:[],reason:'אין מגמה מבוססת'});assert.match(vm.runInContext('manualEntryView()',c),/manual-insights[\s\S]*מגמות בולטות ותכנון הפקדות/);assert.match(vm.runInContext('manualEntryView()',c),/data-plan-deposits/);const menu=vm.runInContext('appMenuView()',c);assert.ok(menu.indexOf('מרכז הדוחות')<menu.indexOf('הזנה ועריכה ידנית'));assert.doesNotMatch(menu,/data-action="home-month-open"|data-action="cards-manage"/);
 const click=data=>app.listeners.get('click').find(fn=>String(fn).includes('appMenuAction'))({target:{closest:()=>({dataset:{action:'tab',...data},closest:()=>null})}});
 click({tab:'manual'});assert.match(app.innerHTML,/<h1>הזנה ועריכה ידנית<\/h1>/);for(const title of ['הכנסות והוצאות','צ׳קים ותשלומים מתוכננים','חסכונות והשקעות','חשבונות ובסיס התקציב'])assert.ok(app.innerHTML.includes(title));assert.doesNotMatch(app.innerHTML,/id="month-form"|id="settings-form"/);
 click({tab:'monthly',section:'monthly-income'});assert.match(app.innerHTML,/id="month-form"/);
 click({tab:'manual'});click({tab:'detail-management',section:'cheques'});assert.match(app.innerHTML,/id="cheques"/);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Entering the manual hub protects unfinished monthly, account, detail and security edits',()=>{
 const {c,app}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[];tab="details"',c);
 const click=()=>app.listeners.get('click').find(fn=>String(fn).includes('appMenuAction'))({target:{closest:()=>({dataset:{action:'tab',tab:'manual'},closest:()=>null})}});
 for(const [set,clear]of [["monthlyPending='2026-10'","monthlyPending=''"],["cashUI.dirty=true","cashUI.dirty=false"],["detailDraft={id:'pending'};detailDirty=true","detailDraft=null;detailDirty=false"],["securitySetup={snapshot:'pending'}","securitySetup=null"]]){vm.runInContext(set,c);click();assert.equal(vm.runInContext('tab',c),'details');vm.runInContext(clear,c);}
 click();assert.equal(vm.runInContext('tab',c),'manual');
});

test('Entering Expenses picks latest data; its month selector updates card snapshots and retains the explicit selection',async()=>{
 const {c,app}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);vm.runInContext("plan.startMonth='2026-01';plan.details=[];plan.months={'2026-09':{values:{...zero(),card1:1234.56},actual:true,includesPlannedCard:false},'2026-08':{values:{...zero(),card1:789.12},actual:true,includesPlannedCard:false}};plan.cardBilling=undefined;plan.cashPlanning.months={};selectedMonth='2026-10';tab='progress'",c);const before=vm.runInContext('JSON.stringify(plan)',c);const button={dataset:{action:'tab',tab:'details'}};for(const listener of app.listeners.get('click')??[])await listener({target:{closest:selector=>selector==='[data-action]'?button:null}});assert.equal(vm.runInContext('selectedMonth',c),'2026-09');assert.ok(app.innerHTML.includes(vm.runInContext('money(1234.56)',c)));assert.match(app.innerHTML,/הכרטיסים שלי/);vm.runInContext("handleDetailChange({value:'2026-08'},'detail-view-month')",c);assert.equal(vm.runInContext('selectedMonth',c),'2026-08');assert.ok(app.innerHTML.includes(vm.runInContext('money(789.12)',c)));const charge=app.innerHTML.match(/<span class="wallet-credit-charge">[\s\S]*?<\/small>/)[0];assert.ok(!charge.includes(vm.runInContext('money(1234.56)',c)));assert.ok(charge.includes(vm.runInContext("monthLabel('2026-08')",c)));assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Card charge data remains accessible in Expenses after removing the Status card tile',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext("plan.cashPlanning.months['2026-10']={a:{values:{...zero(),card1:1200},actual:true,includesPlannedCard:true,includesPlannedDirect:false,balance:5000,date:'2026-10-18'},b:{values:{...zero(),card2:300},actual:true,includesPlannedCard:true,includesPlannedDirect:false,balance:3000,date:'2026-10-18'}};plan.cardBilling=undefined",c);
 const before=vm.runInContext('JSON.stringify(plan)',c);assert.doesNotMatch(vm.runInContext('homeView()',c),/status-expense-total|מגמות בולטות/);const expenses=vm.runInContext('expensesView()',c);assert.ok(expenses.includes(vm.runInContext('money(1200)',c)));assert.ok(expenses.includes(vm.runInContext('money(300)',c)));assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Status month drill-down keeps the saved budget intact and supports explicit back, native back/forward and guarded drafts',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext("plan.startMonth='2026-01';plan.details=[{id:'d',name:'קנייה',amount:25,category:'מזון',method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];tab='progress';selectedMonth='2026-10';",c);
 const before=vm.runInContext('JSON.stringify(plan)',c),entries=[];let backCalls=0,go=0;c.history={state:null,replaceState(s){this.state=s;entries[0]=s;},pushState(s){this.state=s;entries[1]=s;},back(){backCalls++;this.state=entries[0];c.expenseHistoryPop({state:entries[0]});},go(n){go=n;}};
 c.openExpenseMonth('2026-09');assert.equal(vm.runInContext('selectedMonth',c),'2026-09');assert.equal(vm.runInContext('tab',c),'details');assert.match(vm.runInContext('expensesView()',c),/חזרה לסטטוס/);assert.match(vm.runInContext('expensesView()',c),/expense-pulse-navigation/);
 c.expenseVisitBack();assert.equal(backCalls,1);assert.equal(vm.runInContext('tab',c),'progress');assert.equal(vm.runInContext('selectedMonth',c),'2026-10');c.history.state=entries[1];c.expenseHistoryPop({state:entries[1]});assert.equal(vm.runInContext('tab',c),'details');
 vm.runInContext('detailDirty=true;detailDraft={id:"editing"}',c);c.expenseHistoryPop({state:entries[0]});assert.equal(go,1);assert.equal(vm.runInContext('tab',c),'details');c.expenseHistoryPop({state:entries[1]});vm.runInContext('detailDraft=null;detailDirty=false',c);c.expenseHistoryPop({state:entries[0]});assert.equal(vm.runInContext('tab',c),'progress');assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 c.expenseHistoryPop({state:{budgitExpense:{...entries[1].budgitExpense,scope:'another/budget'}}});assert.equal(vm.runInContext('tab',c),'progress');
});


test('Expenses month bars replace the dropdown and filter categories/cards in place without changing the plan or pushing history',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);
 vm.runInContext("plan.startMonth='2026-01';plan.details=[{id:'a',name:'קנייה',amount:25,category:'מזון',method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'},{id:'b',name:'נסיעה',amount:50,category:'תחבורה',method:'card1',month:'2026-10',date:'2026-10-01',number:'',status:'cleared',accounting:'included'}];tab='progress';selectedMonth='2026-10'",c);
 const before=vm.runInContext('JSON.stringify(plan)',c),entries=[];let pushes=0;
 c.history={state:null,replaceState(s){this.state=s;entries[0]=s;},pushState(s){this.state=s;pushes++;},back(){}};
 c.openExpenseMonth('2026-09');const initial=vm.runInContext('expensesView()',c);
 assert.doesNotMatch(initial,/name="detail-view-month"/);assert.ok(initial.indexOf('הוצאות לפי חודש')<initial.indexOf('חלוקה לפי קטגוריה'));assert.match(initial,/data-action="expense-filter-month"/);
 c.filterExpenseMonth('2026-10');assert.equal(vm.runInContext('tab',c),'details');assert.equal(vm.runInContext('selectedMonth',c),'2026-10');assert.equal(pushes,1);assert.equal(c.history.state.budgitExpense.month,'2026-10');
 let html=vm.runInContext('expensesView()',c);assert.match(html,/תחבורה/);assert.doesNotMatch(html,/data-category-leaf="מזון"/);assert.match(html,/data-month="2026-10"[^>]*aria-current="date"/);
 vm.runInContext("detailDraft={id:'unsaved'};detailDirty=true",c);c.filterExpenseMonth('2026-08');assert.equal(vm.runInContext('selectedMonth',c),'2026-10');vm.runInContext('detailDraft=null;detailDirty=false',c);
 c.filterExpenseMonth('2026-03');html=vm.runInContext('expensesView()',c);assert.match(html,/אין פירוט הוצאות לחודש הזה/);assert.match(html,/data-month="2026-02"/);assert.equal(pushes,1);
 c.filterExpenseMonth('2026-02');assert.equal(vm.runInContext('selectedMonth',c),'2026-02');assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 const status=vm.runInContext('homeView()',c);assert.ok(status.indexOf('expense-pulse')<status.indexOf('home-savings-tile'));assert.ok(status.includes(vm.runInContext('money(savingsBalances(plan,todayMonth()).balance)',c)));
});


test('Card report transactions use original rows for the selected stable card ID and billing month, preserving refunds and ignoring analysis splits',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);
 vm.runInContext(`plan.details=[
 {id:'original',name:'חנות <מקור>',amount:123.45,category:'מזון',method:'card1',month:'2026-10',date:'2026-09-20',status:'cleared',accounting:'included',statement:{issuer:'isracard',dueDate:'2026-10-15',notes:'תשלום 2 מתוך 3',originalCents:37035}},
 {id:'refund',name:'זיכוי',amount:-23.45,category:'מזון',method:'card1',month:'2026-10',date:'2026-09-21',status:'cleared',accounting:'included',statement:{issuer:'isracard',dueDate:'2026-10-15'}},
 {id:'other-card',name:'כרטיס אחר',amount:999,method:'card2',month:'2026-10',date:'2026-09-20',status:'cleared',statement:{issuer:'cal'}},
 {id:'other-month',name:'חודש אחר',amount:999,method:'card1',month:'2026-09',date:'2026-09-20',status:'cleared',statement:{issuer:'cal'}},
 {id:'manual',name:'ידני',amount:999,method:'card1',month:'2026-10',date:'2026-09-20',status:'cleared'},
 {id:'cancelled',name:'בוטל',amount:999,method:'card1',month:'2026-10',date:'2026-09-20',status:'cancelled',statement:{issuer:'cal'}}];
 plan.detailAnnotations=[{detailId:'original',sourceCents:12345,parts:[{category:'אחר',cents:10000,person:'',event:''},{category:'מזון',cents:2345,person:'',event:''}]}];
 plan.merchantRegistry=[{source:'חנות <מקור>',display:'כינוי ששונה'}];plan.creditCards=[{id:'card1',name:'שם חדש',alias:''},{id:'card2',name:'אחר',alias:''}];`,c);
 const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext("walletStatementContent('card1','2026-10')",c);
 assert.match(html,/שם חדש|עסקאות בדוח/);assert.match(html,/20\.09\.2026/);assert.match(html,/חנות &lt;מקור&gt;/);assert.match(html,/תשלום 2 מתוך 3/);assert.doesNotMatch(html,/כרטיס אחר|חודש אחר|ידני|בוטל|כינוי ששונה|<מקור>/);
 assert.equal((html.match(/חנות &lt;מקור&gt;/g)||[]).length,1);assert.ok(html.includes(vm.runInContext('money(123.45)',c)));assert.ok(html.includes(vm.runInContext('money(-23.45)',c)));assert.ok(html.includes(vm.runInContext('money(100)',c)));
 assert.match(vm.runInContext("walletStatementContent('card2','2026-09')",c),/לא נקלט פירוט עסקאות/);assert.equal(vm.runInContext("walletStatementContent('unknown','2026-10')",c),'');
 const cards=vm.runInContext('walletCreditCardsView()',c);assert.match(cards,/data-wallet-transactions="card1" data-month="2026-10" aria-haspopup="dialog"/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});
test('Long card statement lists offer more rows without silently truncating the report total',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);vm.runInContext("plan.details=Array.from({length:51},(_,i)=>({id:'r'+i,name:'בית עסק '+i,method:'card1',month:'2026-10',date:'2026-09-20',amount:1,status:'cleared',statement:{issuer:'cal'}}))",c);
 const first=vm.runInContext("walletStatementContent('card1','2026-10')",c);assert.match(first,/עוד עסקאות \(1\)/);assert.doesNotMatch(first,/בית עסק 50/);assert.ok(first.includes(vm.runInContext('money(51)',c)));const all=vm.runInContext("walletStatementContent('card1','2026-10',100)",c);assert.match(all,/בית עסק 50/);assert.doesNotMatch(all,/data-wallet-transactions-more/);
});


test('Status report reminders link to the exact card and remain until imported changes are saved',()=>{
 const {c}=client();cashClientPlan(c);c.billingToday=()=> '2026-10-15';
 const before=vm.runInContext('JSON.stringify(plan)',c);let html=vm.runInContext('homeView()',c);assert.match(html,/תזכורת להעלאת דוח/);assert.match(html,/data-action="report-inbox" data-card="card1"/);assert.match(html,/15\.10\.2026/);
 c.draftSavedSnapshot=before;vm.runInContext("plan.cardBilling={version:1,reports:[{cardId:'card1',accountId:'a',dueDate:'2026-10-15',updatedOn:'2026-10-15',amount:0,source:'file',status:'pending'}]};dirty=true",c);
 assert.match(vm.runInContext('homeReportRemindersView(billingToday())',c),/data-card="card1"/);vm.runInContext('dirty=false',c);html=vm.runInContext('homeReportRemindersView(billingToday())',c);assert.doesNotMatch(html,/data-card="card1"/);assert.match(html,/data-card="card2"/);
 vm.runInContext("plan.cardBilling.reports.push({...plan.cardBilling.reports[0],cardId:'card2',accountId:'b'});",c);assert.equal(vm.runInContext('homeReportRemindersView(billingToday())',c),'');
 vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);assert.doesNotMatch(vm.runInContext('walletCreditCardsView()',c),/פוש|עשרת הימים|push-enable/);
});


test('Missing no-transactions payer offers a persistent direct repair link, focuses the exact card field and protects drafts',()=>{
 const {c,notice}=client();cashClientPlan(c);c.CSS={escape:value=>value};vm.runInContext("plan.startMonth='2026-01';plan.cashPlanning.cardAccounts={};tab='details'",c);
 const before=vm.runInContext('JSON.stringify(plan)',c),html=vm.runInContext('cardStatementCoverageView()',c);assert.match(html,/data-card-payer-help="card1"/);assert.match(html,/data-action="cash-settings" data-card="card1"/);
 let helpFocused=0,helpScrolled=0,fieldFocused=0;const field={focus(){fieldFocused++;}},links={open:false},help={scrollIntoView(){helpScrolled++;},querySelector(){return {focus(){helpFocused++;}};}};
 c.document.querySelector=selector=>selector==='[data-card-payer-help="card1"]'?help:selector==='[name="cash-card-card1"]'?field:selector==='[data-cash-links]'?links:null;c.scrollToSection=()=>{};
 vm.runInContext("detailAction('card-no-transactions',{dataset:{card:'card1',month:'2026-01'}})",c);assert.equal(helpFocused,1);assert.equal(helpScrolled,1);assert.doesNotMatch(notice.textContent,/לשייך את הכרטיס/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext('cashUI.dirty=true',c);c.cashOpenSettings({dataset:{card:'card1'}});assert.equal(vm.runInContext('tab',c),'details');vm.runInContext('cashUI.dirty=false',c);
 c.cashOpenSettings({dataset:{card:'card1'}});assert.equal(vm.runInContext('tab',c),'settings');assert.equal(vm.runInContext('settingsSection',c),'cash-accounts');assert.equal(links.open,true);assert.equal(fieldFocused,1);assert.match(vm.runInContext('cashRepairView()',c),/בחרו את החשבון/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext("plan.cashPlanning.cardAccounts.card1='a'",c);assert.equal(vm.runInContext('cashRepairView()',c),'');
});

test('Status goal miniatures use saved allocated progress, configured deposits and deadlines without applying simulations',()=>{
 const {c}=client();vm.runInContext('savingsTransfer=null;scenarioItems=[]',c);c.billingToday=()=> '2026-10-20';
 const before=vm.runInContext('JSON.stringify(plan)',c);const html=vm.runInContext(`homeSavingsGoalsView({items:[
 {id:'on',name:'חופשה <משפחתית>',current:1000,target:2000,monthly:500,deadline:'2027-02-28'},
 {id:'slow',name:'בית',current:1000,target:20000,monthly:100,deadline:'2027-02-28'},
 {id:'expired',name:'רכב',current:0,target:1000,monthly:100,deadline:'2026-09-01'},
 {id:'unset',name:'לימודים',current:0,target:1000,monthly:0},
 {id:'no-date',name:'טיול',current:100,target:1000,monthly:100},
 {id:'done',name:'קרן ביטחון',current:1500,target:1000,monthly:0,deadline:'2026-01-01'}]})`,c);
 assert.match(html,/חופשה &lt;משפחתית&gt;/);assert.doesNotMatch(html,/<משפחתית>/);assert.match(html,/בקצב המתאים/);assert.match(html,/כדאי להגביר קצב/);assert.match(html,/מועד היעד עבר/);assert.match(html,/טרם הוגדר קצב/);assert.match(html,/ללא תאריך יעד/);assert.match(html,/הסכום ליעד קיים/);assert.match(html,/עוד 2 הפקדות/);assert.match(html,/28\.02\.2027/);assert.match(html,/aria-valuenow="50\.0"/);assert.match(html,/aria-valuenow="100\.0"/);assert.match(html,/ללא תשואה/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 const saved=vm.runInContext('homeSavingsTile()',c);vm.runInContext("savingsUI.sim.house={future:999999,changed:true,deposit:200000}",c);assert.equal(vm.runInContext('homeSavingsTile()',c),saved);vm.runInContext('savingsUI.sim={}',c);
 c.homeAction('home-goal-open',{dataset:{id:'holiday'}});assert.equal(vm.runInContext('savingsUI.id',c),'holiday');assert.equal(vm.runInContext('tab',c),'goals');
 vm.runInContext("tab='progress';savingsUI.formDirty=true",c);c.homeAction('home-goal-open',{dataset:{id:'house'}});assert.equal(vm.runInContext('tab',c),'progress');assert.equal(vm.runInContext('savingsUI.id',c),'holiday');assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 assert.equal(vm.runInContext('homeSavingsGoalsView({items:[]})',c),'');
});

test('Theme accent changes are immediate device preferences while account colors use the existing guarded budget save',async()=>{
 const {c,app}=client();cashClientPlan(c);vm.runInContext(fs.readFileSync('src/wallet-design.js','utf8'),c);const initial=vm.runInContext('JSON.stringify(plan)',c);let chosen;c.window.monthlyFlowTheme.setAccent=value=>{chosen=value;return true;};
 const change=app.listeners.get('change').find(fn=>String(fn).includes('appearance-accent'));await change({target:{name:'appearance-accent',value:'rose',checked:true,dataset:{}}});assert.equal(chosen,'rose');assert.equal(vm.runInContext('dirty',c),false);assert.equal(vm.runInContext('JSON.stringify(plan)',c),initial);assert.match(vm.runInContext('settingsView()',c),/name="appearance-accent"/);
 c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','Renamed bank'],['cash-buffer','0'],['cash-opening',''],['cash-opening-month','2026-10'],['cash-color','mint']]);c.form={dataset:{cashForm:'config'},reportValidity:()=>true,elements:{namedItem:()=>({dataset:{current:'0'}})},querySelector:()=>({hidden:true,textContent:'',scrollIntoView(){}})};vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext("plan.cashPlanning.accounts.find(a=>a.id==='a').color",c),'mint');assert.equal(vm.runInContext('dirty',c),true);assert.equal(vm.runInContext('plan.cashPlanning.cardAccounts.card1',c),'a');
 const home=vm.runInContext('homeView()',c);assert.match(home,/data-account-color="mint" data-wallet-card-id="a"/);const cards=vm.runInContext('walletCreditCardsView()',c);assert.match(cards,/data-account-color="mint" data-wallet-card-id="card1"/);assert.match(vm.runInContext('cashTabs()',c),/data-account-color="mint"/);
 c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','Renamed again'],['cash-buffer','0'],['cash-opening',''],['cash-opening-month','2026-10']]);vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext("plan.cashPlanning.accounts.find(a=>a.id==='a').color",c),'mint');
 c.budgetFormData=()=>new Map([['cash-id','a'],['cash-label','Renamed again'],['cash-buffer','0'],['cash-opening',''],['cash-opening-month','2026-10'],['cash-color','']]);vm.runInContext('cashSubmit(form)',c);assert.equal(vm.runInContext("plan.cashPlanning.accounts.find(a=>a.id==='a').color",c),undefined);
});


test('Status investment chart separates reported deposits from estimates, missing months and portfolio value',()=>{
 const {c}=client();vm.runInContext(`savingsTransfer=null;plan.months={
 '2025-09':{values:{...zero(),personalInvest:50},actual:true},
 '2025-11':{values:{...zero(),personalInvest:10.01,sharedInvest:20.02},actual:true},
 '2026-01':{values:{...zero(),personalInvest:9000},actual:false},
 '2026-09':{values:zero(),actual:true},
 '2026-10':{values:{...zero(),personalInvest:100.01,sharedInvest:200.02},actual:true},
 '2026-11':{values:{...zero(),personalInvest:9999},actual:true}};plan.startMonth='2025-01';homeSync();`,c);
 const before=vm.runInContext('JSON.stringify(plan)',c),summary=JSON.parse(vm.runInContext('JSON.stringify(homeInvestmentSummary())',c));
 assert.equal(summary.total,380.06);assert.equal(summary.series.length,12);assert.equal(summary.series[0].month,'2025-11');assert.equal(summary.series.at(-1).month,'2026-10');assert.equal(summary.series[0].amount,30.03);assert.equal(summary.series[2].reported,false);assert.equal(summary.series.at(-2).reported,true);assert.equal(summary.series.at(-2).amount,0);
 const html=vm.runInContext('homeInvestmentTile()',c);assert.equal([...html.matchAll(/data-action="home-investment-month"/g)].length,12);assert.match(html,/טרם דווח|home-investment-gap/);assert.match(html,/זה אינו שווי התיק כיום/);assert.ok(html.includes(vm.runInContext('money(300.03)',c)));assert.ok(vm.runInContext('homeView()',c).indexOf('home-investment-tile')>vm.runInContext('homeView()',c).indexOf('home-savings-tile'));
 c.homeAction('home-investment-month',{dataset:{month:'2025-11'}});assert.match(vm.runInContext('homeInvestmentTile()',c),/data-action="home-investment-open" data-month="2025-11"/);assert.ok(vm.runInContext('homeInvestmentTile()',c).includes(vm.runInContext('money(30.03)',c)));assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext('investmentUI.initial=999999;investmentUI.monthly=50000',c);assert.equal(vm.runInContext('homeInvestmentSummary().total',c),380.06);
});

test('Investment summary counts confirmed accounts during incomplete months without double-counting combined reports',()=>{
 const {c}=client();cashClientPlan(c);vm.runInContext(`plan.months={'2026-09':{values:{...zero(),personalInvest:7777},actual:false},'2026-10':{values:{...zero(),personalInvest:300},actual:true}};plan.cashPlanning.months={
 '2026-09':{a:{values:{...zero(),personalInvest:10.01,sharedInvest:20.02},actual:true},b:{values:{...zero(),personalInvest:9999},actual:false}},
 '2026-10':{a:{values:{...zero(),personalInvest:100},actual:true},b:{values:{...zero(),personalInvest:200},actual:true}}};`,c);
 const summary=JSON.parse(vm.runInContext('JSON.stringify(homeInvestmentSummary())',c));assert.equal(summary.total,330.03);assert.equal(summary.series.at(-2).amount,30.03);assert.equal(summary.series.at(-2).partial,true);assert.equal(summary.series.at(-1).amount,300);assert.equal(summary.series.at(-1).partial,false);
 vm.runInContext('plan.months={};plan.cashPlanning.months={}',c);const html=vm.runInContext('homeInvestmentTile()',c);assert.match(html,/טרם דווח/);assert.equal(vm.runInContext('homeInvestmentSummary().hasRecords',c),false);
});

test('Investment update opens selected month deposit controls and protects pending edits and budget scope',()=>{
 const {c}=client();cashClientPlan(c);let section='';c.scrollToSection=value=>{section=value;};vm.runInContext("plan.startMonth='2026-01';tab='progress';cashUI.dirty=true",c);
 const before=vm.runInContext('JSON.stringify(plan)',c);c.homeAction('home-investment-open',{dataset:{month:'2026-09'}});assert.equal(vm.runInContext('tab',c),'progress');
 vm.runInContext('cashUI.dirty=false',c);c.homeAction('home-investment-open',{dataset:{month:'2026-09'}});assert.equal(vm.runInContext('tab',c),'monthly');assert.equal(vm.runInContext('selectedMonth',c),'2026-09');assert.equal(section,'[data-investment-deposits]');assert.match(vm.runInContext('cashMonthView()',c),/data-investment-deposits/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext("homeUI.investmentMonth='2026-09';activeBudget='another';homeSync()",c);assert.equal(vm.runInContext('homeUI.investmentMonth',c),null);
});

test('Month charts share wallet pagination, six-month slides, year labels and reachable gaps without old text paging buttons',()=>{
 const {c}=client();vm.runInContext("savingsTransfer=null;plan.startMonth='2025-11';plan.details=plan.details.filter(row=>row.month<=todayMonth());homeSync()",c);
 const before=vm.runInContext('JSON.stringify(plan)',c),investment=vm.runInContext('homeInvestmentTile()',c),expenses=vm.runInContext("expensePulseView('2026-10',true)",c);
 for(const html of [investment,expenses]){
  assert.equal([...html.matchAll(/class="chart-slide"/g)].length,2);assert.match(html,/wallet-pagination chart-pagination/);assert.match(html,/class="wallet-turn" data-chart-step="-1"/);assert.match(html,/class="wallet-dots"/);assert.match(html,/data-chart-active="1"/);assert.match(html,/data-chart-index="1"[^>]*aria-current="true"/);assert.match(html,/2025/);assert.match(html,/2026/);assert.doesNotMatch(html,/expense-pulse-pages|>קודמים<|>הבאים</);
 }
 assert.equal([...investment.matchAll(/data-action="home-investment-month"/g)].length,12);assert.equal([...expenses.matchAll(/data-action="expense-filter-month"/g)].length,12);
 assert.match(vm.runInContext("expensePulseView('2025-12',true)",c),/data-chart-active="0"/);
 vm.runInContext("plan.details.push({id:'future-chart',name:'עתידי',amount:12,category:'מזון',method:'card1',month:'2026-12',date:'2026-11-01',number:'',status:'cleared',accounting:'included'})",c);
 assert.match(vm.runInContext("expensePulseView('2026-12',true)",c),/data-month="2026-12"[^>]*aria-current="date"/);
 vm.runInContext("plan.details.pop();plan.startMonth='2026-10'",c);assert.doesNotMatch(vm.runInContext("expensePulseView('2026-10',true)",c),/chart-pagination/);
 vm.runInContext("plan.startMonth='2025-11'",c);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
});

test('Chart slides follow RTL arrows and keyboard, keep browsing position and reset across selected months or budget scope without editing money',()=>{
 const {c}=client();const before=vm.runInContext('JSON.stringify(plan)',c);let slider,track,dots,arrows,listeners,offset,motion;
 function fake(selection='2026-10',active=2){
  offset=0;listeners={};dots=[0,1,2].map(i=>({dataset:{chartIndex:String(i)},setAttribute(k,v){this[k]=v;}}));arrows=[-1,1].map(i=>({dataset:{chartStep:String(i)},disabled:false}));
  track={children:[0,1,2].map(i=>({dataset:{chartKey:String(i)},getBoundingClientRect:()=>({left:-i*316-offset,width:300})})),getBoundingClientRect:()=>({left:0,width:300}),addEventListener(k,v){listeners[k]=v;},scrollBy(options){motion=options.behavior;offset+=options.left;listeners.scroll?.();}};
  slider={dataset:{chartSlider:'test',chartSelection:selection,chartActive:String(active)},querySelector:()=>track,querySelectorAll:selector=>selector==='[data-chart-index]'?dots:arrows};
  c.document.querySelectorAll=selector=>selector==='[data-chart-slider]'?[slider]:[];return slider;
 }
 c.matchMedia=()=>({matches:true});fake();c.chartSliderEnhance();assert.equal(slider.dataset.chartPage,2);assert.equal(arrows[1].disabled,true);assert.equal(dots[2]['aria-current'],'true');assert.equal(motion,'instant');
 let prevented=false;listeners.keydown({target:track,key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(slider.dataset.chartPage,1);
 fake();c.chartSliderEnhance();assert.equal(slider.dataset.chartPage,1);
 listeners.keydown({target:track,key:'End',preventDefault(){}});assert.equal(slider.dataset.chartPage,2);
 listeners.keydown({target:track,key:'Home',preventDefault(){}});assert.equal(slider.dataset.chartPage,0);assert.equal(arrows[0].disabled,true);assert.equal(arrows[1].disabled,false);
 fake('2026-09',1);c.chartSliderEnhance();assert.equal(slider.dataset.chartPage,1);
 vm.runInContext("activeBudget='other-budget'",c);fake('2026-09',2);c.chartSliderEnhance();assert.equal(slider.dataset.chartPage,2);
 c.matchMedia=()=>({matches:false});c.chartSliderMove(slider,1);assert.equal(motion,'smooth');const savedOffset=offset;c.chartSliderMove(slider,-1);assert.equal(offset,savedOffset);
 assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);assert.equal(vm.runInContext('dirty',c),false);
});
