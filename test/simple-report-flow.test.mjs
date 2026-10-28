import * as inboxController from '../src/report-inbox-controller.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import * as bank from '../src/bank-import-model.js';
import * as budget from '../src/budget.js';import * as billing from '../src/card-statement-model.js';import * as inbox from '../src/report-inbox-model.js';import * as classifier from '../tools/bank-csv/classifier.mjs';
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:12,defaults:budget.zero(),months:{},expenses:[],demo:false,setupCompleted:true,details:[],creditCards:[{id:'card1',name:'כרטיס בדיקה',alias:'1111',billingDay:15}],cashPlanning:{accounts:[{id:'a',label:'חשבון בדיקה',opening:1000,buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}});
const report={issuer:'isracard',dueDate:'2026-03-15',amount:10,entries:[{date:'2026-02-12',merchant:'בית עסק חדש',amountCents:1000,originalCents:1000,notes:''}]};
function harness(){
 const p=base(),ui={scope:'u/personal',snapshot:JSON.stringify(p),revision:1,items:[],newAccounts:[],newCards:[],blank:false,merchantRules:[],categoryChoices:new Map(),bankChoices:new Map(),duplicates:0};
 const c=vm.createContext({...inboxController,...budget,...bank,...billing,...inbox,classifierFixture:classifier,plan:p,accountId:'u',activeBudget:'personal',revision:1,app:{addEventListener(){}},window:{addEventListener(){}},document:{getElementById:()=>null},demoPreview:true,todayMonth:()=> '2026-10',statementMerchant:s=>s.trim().toLowerCase(),ui,crypto:globalThis.crypto});
 vm.runInContext(fs.readFileSync('src/card-billing-client.js','utf8'),c);vm.runInContext(fs.readFileSync('src/report-inbox-client.js','utf8').replace("await import('/bank-import/classifier.mjs')",'classifierFixture'),c);vm.runInContext('reportInbox=ui;inboxRender=()=>{};billingToday=()=>"2026-10-20";',c);return{c,ui,p};
}
test('A reconciled statement imports without category questions, retains exact financial amounts and can be categorized later',async()=>{
 const {c,ui,p}=harness();ui.items=[{id:'file',name:'test.pdf',hash:'a'.repeat(64),kind:'card',target:'card1',payer:'a',report,decisions:{},bankOptions:{scope:'complete'}}];const before=JSON.stringify(p);
 await c.inboxBuild(ui);assert.equal(ui.issues,0);assert.equal(budget.validatePlan(ui.build),true);assert.equal(ui.build.details[0].category,'לסיווג');assert.equal(ui.build.details[0].amount,10);assert.equal(ui.build.cardBilling.reports[0].amount,10);assert.equal(JSON.stringify(p),before);
 const imported=ui.build,source=imported.details[0],categorized=budget.annotateExpenseDetail(imported,source.id,[{category:'מזון',cents:1000,person:'',event:''}]);assert.equal(source.category,'לסיווג');assert.equal(budget.analyticalExpenseDetails(categorized)[0].category,'מזון');assert.deepEqual(budget.forecast(categorized),budget.forecast(imported));assert.deepEqual(categorized.cardBilling,imported.cardBilling);assert.equal(await inbox.inboxReceiptPresent(categorized,categorized.reportInbox.receipts[0]),true);
 const repeated=await billing.prepareCardStatement(imported,{...report,dueDate:'2026-04-15'},'card1');assert.equal(repeated.rows[0].category,'');const learned=await billing.prepareCardStatement(categorized,{...report,dueDate:'2026-04-15'},'card1');assert.equal(learned.rows[0].category,'מזון');
});
test('Deferring categories never bypasses duplicate matching or amount reconciliation',async()=>{
 const p=base();p.details=[{id:'manual',method:'card1',month:'2026-03',date:'2026-02-12',name:'בית עסק חדש',amount:10,category:'מזון',accounting:'included',status:'cleared',number:''}];const preview=await billing.prepareCardStatement(p,report,'card1');assert.throws(()=>billing.applyBillingBatch(p,[{cardId:'card1',accountId:'a',dueDate:report.dueDate,amount:10,statement:preview,deferCategories:true}],'2026-10-20'),/דומות/);
 await assert.rejects(billing.prepareCardStatement(base(),{...report,amount:11},'card1'),/תקין/);
});
test('Unreadable sources and inconsistent totals stay local and do not create stored failed reports',async()=>{
 for(const parsed of [null,{kind:'card',report:{...report,amount:11}},{kind:'bank',records:[{valid:false,currency:'ILS'}]}]){
  const {c,ui}=harness();let stores=0;c.storeInboxFile=async()=>{stores++;};c.inboxReadFile=async()=>{if(!parsed)throw Error('unreadable');return parsed;};c.inboxBuild=async()=>{};await c.inboxLoadFiles([{name:'test.pdf',size:10}]);assert.equal(stores,0);assert.equal(ui.items.length,1);assert.ok(ui.items[0].error);assert.equal(ui.items[0].storedId,undefined);
 }
});
test('Removing an unimported file deletes it rather than archiving and respects sibling revision witnesses',async()=>{
 const {c,ui}=harness();ui.items=[{storedId:'one',storedRevision:2},{storedId:'two',storedRevision:4}];let action;c.reportAPI=()=>'/api/reports';c.reportFetch=async(url,options)=>{action=JSON.parse(options.body);return{deleted:true,revisions:{two:5}};};c.inboxBuild=async()=>{};c.persistInboxDraft=async()=>{};await c.inboxClick({target:{closest:selector=>selector==='[data-inbox]'?{dataset:{inbox:'remove',index:'0'}}:null}});assert.equal(action.action,'delete');assert.equal(ui.items.length,1);assert.equal(ui.items[0].storedRevision,5);
});


test('Report center reviews incoming transfers separately and stores a non-refund rule',async()=>{
 const {c,ui,p}=harness();ui.items=[{id:'bank-file',name:'shared.csv',hash:'b'.repeat(64),kind:'bank',target:'a',from:'2026-02-01',to:'2026-02-28',records:[{line:1,date:'2026-02-20',reference:'transfer-1',amountCents:125050,description:'העברה נכנסת',beneficiary:'פרטי',details:'',purpose:'',currency:'ILS',valid:true,balanceCents:225050}],decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'}}];
 await c.inboxBuild(ui);assert.equal(ui.bankGroups.length,1);assert.ok(ui.issues>0);
 c.persistInboxDraft=async()=>{};
 await c.inboxChange({target:{matches:()=>false,dataset:{inboxBankGroup:'0'},value:'incomingTransfers'}});
 assert.equal(ui.issues,0);assert.ok(budget.validatePlan(ui.build));
 assert.equal(ui.build.months['2026-02'].values.incomingTransfers,1250.5);
 assert.equal(ui.build.months['2026-02'].values.otherIncome,0);
 assert.equal(ui.build.bankImport.accounts[0].rules[0].refund,false);
 assert.equal(budget.cashAccountForecast(ui.build,'a')[1].balance,2250.5);
 assert.equal(JSON.stringify(p.months),'{}');
});
