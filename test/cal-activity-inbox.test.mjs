import * as inboxController from '../src/report-inbox-controller.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import * as budget from '../src/budget.js';import * as billing from '../src/card-statement-model.js';import * as inbox from '../src/report-inbox-model.js';
import * as activityAPI from '../tools/bank-csv/cal-activity.mjs';import {activityFixture} from '../tools/bank-csv/cal-activity-fixture.mjs';
function base(){return{startMonth:'2026-01',opening:1000,buffer:100,horizon:12,defaults:budget.zero(),months:{},expenses:[],demo:false,setupCompleted:true,details:[],creditCards:[{id:'card1',name:'כרטיס בדיקה',alias:'1111',billingDay:15}],cashPlanning:{accounts:[{id:'a',label:'חשבון בדיקה',opening:1000,buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}};}
function harness(p=base()){
 const source=fs.readFileSync('src/report-inbox-client.js','utf8').replace("await import('/bank-import/classifier.mjs')",'({suggest(){throw Error("No bank rows expected");}})').replace("await import('/bank-import/cal-activity.mjs')",'activityAPIFixture');
 const item={...activityAPI.parseCalActivity([activityFixture()]),id:'item',name:'synthetic.xlsx',hash:'a'.repeat(64),target:'card1',payer:'a',decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'}};
 const ui={scope:'u/personal',snapshot:JSON.stringify(p),revision:1,items:[item],newAccounts:[],newCards:[],blank:false,merchantRules:[],categoryChoices:new Map([['חנות לדוגמה','אחר'],['זיכוי לדוגמה','אחר'],['חנות שנייה','אחר']]),bankChoices:new Map(),duplicates:0};
 const c=vm.createContext({...inboxController,...budget,...billing,...inbox,activityAPIFixture:activityAPI,plan:p,accountId:'u',activeBudget:'personal',revision:1,app:{addEventListener(){}},window:{addEventListener(){}},document:{},todayMonth:()=> '2026-10',billingToday:()=> '2026-10-19',statementMerchant:s=>s.trim().toLowerCase(),money:v=>v+' ₪',esc:s=>String(s??'').replaceAll('<','&lt;'),ui});vm.runInContext(fs.readFileSync('src/card-billing-client.js','utf8'),c);vm.runInContext(source,c);vm.runInContext('reportInbox=ui;inboxRender=()=>{};',c);return{c,ui,item};
}
test('Activity requires cycle, final total and acknowledgement before the inbox can build a proposal',async()=>{
 const {c,ui,item}=harness();item.report={dueDate:'2026-10-15',amount:430};await c.inboxBuild(ui);assert.equal(ui.build,null);assert.equal(item.report,null);assert.ok(ui.issues>0);
 Object.assign(item,{activityCycle:'2026-10-15',activityTotal:'90',activityConfirmed:true});await c.inboxBuild(ui);assert.equal(ui.issues,0,JSON.stringify({error:ui.error,warning:item.warning,activityError:item.activityError,groups:ui.cardGroups}));assert.equal(ui.build.cardBilling.reports[0].amount,90);assert.equal(ui.build.details.length,2);assert.ok(!ui.build.details.some(d=>/ממתינה|תשלומים/.test(d.name)));assert.equal(ui.base.details.length,0);
});
test('Importing another cycle from the same activity file is possible and exact reimports remain duplicates',async()=>{
 const first=harness();Object.assign(first.item,{activityCycle:'2026-10-15',activityTotal:'90',activityConfirmed:true});await first.c.inboxBuild(first.ui);const next=first.ui.build;
 const second=harness(next);Object.assign(second.item,{activityCycle:'2026-11-15',activityTotal:'40',activityConfirmed:true});await second.c.inboxBuild(second.ui);assert.equal(second.ui.issues,0);assert.equal(second.ui.build.cardBilling.reports.length,2);assert.equal(second.ui.build.details.length,3);const receipts=second.ui.build.reportInbox.receipts;assert.equal(new Set(receipts.map(r=>r.hash)).size,2);assert.ok(receipts.every(r=>r.hash!==first.item.hash));
 const again=harness(second.ui.build);Object.assign(again.item,{activityCycle:'2026-10-15',activityTotal:'90',activityConfirmed:true});await again.c.inboxBuild(again.ui);assert.equal(again.item.already,true);assert.equal(again.ui.build.details.length,3);
});
test('Changing cycle or final total clears acknowledgement, report and proposal; excluded rows remain visible',async()=>{
 const {c,ui,item}=harness();Object.assign(item,{activityCycle:'2026-10-15',activityTotal:'90',activityConfirmed:true});await c.inboxBuild(ui);
 const event=(dataset,value)=>({target:{dataset,value,matches:()=>false}});await c.inboxChange(event({inboxCycle:'0'},'2026-11-15'));assert.equal(item.activityConfirmed,false);assert.equal(item.activityTotal,'');assert.equal(item.report,null);assert.equal(ui.build,null);
 await c.inboxChange(event({inboxCycleTotal:'0'},'40'));assert.equal(item.activityConfirmed,false);assert.equal(ui.build,null);
 const html=c.inboxActivityView(item,0);assert.match(html,/סך הגיליון/);assert.match(html,/עסקה בקליטה/);assert.match(html,/תשלום החודשי חסר/);assert.match(html,/מחזור חיוב אחר/);assert.match(html,/data-inbox-cycle-confirmed/);
});
