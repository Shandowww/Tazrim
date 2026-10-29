import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {zero,validatePlan,forecast,detailSummary} from '../src/budget.js';
import {saveBillingReport} from '../src/card-billing-model.js';
import {prepareCardStatement,applyCardStatement,applyBillingBatch,statementCycleExists,statementWalletMatch} from '../src/card-statement-model.js';
const base=()=>({startMonth:'2026-10',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,creditCards:[{id:'card1',name:'כאל',alias:'',billingDay:15}],cashPlanning:{accounts:[{id:'a',label:'חשבון',opening:8000,buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}});
const report=(entries=[{date:'2026-10-13',merchant:'חנות לדוגמה',amountCents:10025,originalCents:30075,notes:'תשלום 1 מתוך 3'}])=>({issuer:'cal',dueDate:'2026-11-15',amount:entries.reduce((n,r)=>n+r.amountCents,0)/100,entries,count:entries.length});
const choices=(preview,category='מזון')=>Object.fromEntries(preview.rows.map(r=>[r.id,{category,match:r.candidates.length?'new':null}]));
test('Statement requires categories, remembers merchants and adds included detail without another cash charge',async()=>{
 const p=saveBillingReport(base(),{cardId:'card1',accountId:'a',dueDate:'2026-11-15',amount:100.25,source:'file'},'2026-10-15'),before=JSON.stringify(p),preview=await prepareCardStatement(p,report(),'card1');
 assert.equal(preview.rows[0].category,'');assert.throws(()=>applyCardStatement(p,preview,{}),/קטגוריה/);
 const next=applyCardStatement(p,preview,choices(preview));assert.equal(validatePlan(next),true);assert.equal(JSON.stringify(p),before);
 assert.deepEqual(forecast(next),forecast(p));assert.equal(next.details[0].amount,100.25);assert.equal(next.details[0].month,'2026-11');assert.equal(next.details[0].date,'2026-10-13');
 assert.equal(detailSummary(next,'2026-11').categories[0].amount,100.25);assert.equal(detailSummary(next,'2026-11').groups[0].total,100.25);assert.equal(detailSummary(next,'2026-11').over,false);
 assert.equal(statementCycleExists(next,'card1','2026-11'),true);
 const second=report([{...report().entries[0],date:'2026-11-12'}]);second.dueDate='2026-12-15';assert.equal((await prepareCardStatement(next,second,'card1')).rows[0].category,'מזון');
});
test('Reimport and reordered statements are idempotent; identical legitimate rows retain multiplicity',async()=>{
 const p=base(),e=report().entries[0],input=report([e,{...e}, {...e,merchant:'חנות אחרת',amountCents:50}]);
 const preview=await prepareCardStatement(p,input,'card1'),next=applyCardStatement(p,preview,choices(preview));assert.equal(next.details.length,3);
 const reordered=await prepareCardStatement(next,report([...input.entries].reverse()),'card1');assert.equal(reordered.rows.filter(r=>r.existing).length,3);
 assert.deepEqual(applyCardStatement(next,reordered,{}),next);
 const changed=report([{...e,amountCents:10026}]);await assert.rejects(prepareCardStatement(next,changed,'card1'),/שונה/);
});
test('Remembered Wallet categories use exact names, ambiguity requires manual classification',async()=>{
 const p=base(),rules=[{merchant:'חנות לדוגמה',category:'בריאות'}];assert.equal((await prepareCardStatement(p,report(),'card1',rules)).rows[0].category,'בריאות');
 p.details=[{id:'manual',name:'חנות לדוגמה',amount:1,category:'מזון',method:'card1',month:'2026-10',date:'2026-10-01',number:'',status:'cleared',accounting:'included'}];
 assert.equal((await prepareCardStatement(p,report(),'card1',rules)).rows[0].category,'');
});
test('Existing manual details require an explicit same/additional choice, and cannot be consumed twice',async()=>{
 const p=base(),entry=report().entries[0];p.details=[{id:'manual',name:entry.merchant,amount:100.25,category:'קניות',method:'card1',month:'2026-11',date:entry.date,number:'',status:'cleared',accounting:'included'}];
 const preview=await prepareCardStatement(p,report(),'card1');assert.throws(()=>applyCardStatement(p,preview,{}),/דומות/);
 const merged=applyCardStatement(p,preview,{[preview.rows[0].id]:{category:'קניות',match:'manual'}});assert.equal(merged.details.length,1);assert.equal(p.details[0].id,'manual');
 const separate=applyCardStatement(p,preview,choices(preview));assert.equal(separate.details.length,2);
 const two=await prepareCardStatement(p,report([entry,entry]),'card1'),selection=Object.fromEntries(two.rows.map(r=>[r.id,{category:'קניות',match:'manual'}]));assert.throws(()=>applyCardStatement(p,two,selection),/שתי שורות/);
});
test('Credits net against their category and original amount links an installment Wallet record only informationally',async()=>{
 const p=base(),entry=report().entries[0],preview=await prepareCardStatement(p,report([entry,{...entry,merchant:'זיכוי',amountCents:-2025,originalCents:-2025,notes:''}]),'card1');
 const next=applyCardStatement(p,preview,choices(preview));assert.equal(validatePlan(next),true);assert.equal(detailSummary(next,'2026-11').recorded,80);
 const event={card_id:'card1',merchant:entry.merchant,cents:30075,currency:'ILS',occurred_at:'2026-10-13T10:00:00Z',kind:'purchase'},before=JSON.stringify(next);
 assert.equal(statementWalletMatch(next,event).amount,100.25);assert.equal(statementWalletMatch(next,{...event,currency:'USD'}),null);assert.equal(statementWalletMatch(next,{...event,card_id:'card2'}),null);assert.equal(JSON.stringify(next),before);
 const invalid=structuredClone(next);delete invalid.details[1].statement;assert.equal(validatePlan(invalid),false);
});
test('Edited details are preserved on exact reimport, and preview conflicts or limits never change data',async()=>{
 let p=base(),preview=await prepareCardStatement(p,report(),'card1');p=applyCardStatement(p,preview,choices(preview));p.details[0].category='קניות';preview=await prepareCardStatement(p,report(),'card1');p.details[0].amount=101;
 const before=JSON.stringify(p);assert.throws(()=>applyCardStatement(p,preview,{}),/השתנה/);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>saveBillingReport(base(),{cardId:'card1',accountId:'a',dueDate:'2026-11-15',amount:100.25,source:'manual'},'2026-10-15'),/הנוכחי/);
 assert.throws(()=>saveBillingReport(base(),{cardId:'card1',accountId:'a',dueDate:'2036-10-15',amount:100.25,source:'file'},'2026-10-15'));
});


test('Wallet cannot replace a statement total, including purchases initially assigned to their purchase month',async()=>{
 const preview=await prepareCardStatement(base(),report(),'card1'),p=applyCardStatement(base(),preview,choices(preview));let message='';
 const c=vm.createContext({plan:p,statementCycleExists,statementWalletMatch,notify:m=>message=m,document:{getElementById:()=>null}});
 vm.runInContext(fs.readFileSync('src/wallet-ui-model.js','utf8').replaceAll(/^export /gm,'')+'\n'+fs.readFileSync('src/apple-pay-client.js','utf8'),c);
 vm.runInContext("walletMonth='2026-11';walletApply('card1')",c);assert.match(message,/כבר נקלט/);
 vm.runInContext("walletMonth='2026-10';walletData={events:[{card_id:'card1',merchant:'חנות לדוגמה',cents:30075,currency:'ILS',occurred_at:'2026-10-13T10:00:00Z',kind:'purchase',state:'included'}]};walletApply('card1')",c);assert.match(message,/אין להעתיק שוב/);
 assert.equal(p.months['2026-10'],undefined);assert.equal(p.details.length,1);
});

test('Batch imports distinct cycles and cards once, validates atomically and refuses overlapping cycles',async()=>{
 const {applyBillingBatch}=await import('../src/card-statement-model.js');
 const p=base();p.creditCards.push({id:'card2',name:'נוסף',alias:'',billingDay:15});p.cashPlanning.cardAccounts.card2='a';
 const first=report(),second={...report(),dueDate:'2026-12-15'},third=report();
 const build=async(input,cardId)=>{const statement=await prepareCardStatement(p,input,cardId);return {cardId,accountId:'a',dueDate:input.dueDate,amount:input.amount,statement,choices:choices(statement,'מזון / מסעדות ובתי קפה')};};
 const entries=await Promise.all([build(first,'card1'),build(second,'card1'),build(third,'card2')]);
 const before=JSON.stringify(p),next=applyBillingBatch(p,entries,'2026-10-15');assert.equal(JSON.stringify(p),before);assert.equal(validatePlan(next),true);assert.equal(next.details.length,3);assert.equal(next.cardBilling.reports.length,3);
 const reentries=await Promise.all(entries.map(async e=>({...e,statement:await prepareCardStatement(next,e.cardId==='card1'&&e.dueDate===second.dueDate?second:first,e.cardId),choices:{}})));
 assert.deepEqual(applyBillingBatch(next,reentries,'2026-10-15'),next);
 assert.throws(()=>applyBillingBatch(p,[entries[0],entries[0]],'2026-10-15'),/יותר מדוח/);
 const invalid=structuredClone(entries);invalid[2].choices={};assert.throws(()=>applyBillingBatch(p,invalid,'2026-10-15'),/קטגוריה/);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>applyBillingBatch(p,[{...entries[0],cardId:'card2'}],'2026-10-15'),/השתנו/);
});

test('Category hierarchy rolls up exact cents, credits and legacy labels without rewriting stored records',async()=>{
 const {categoryRollup,categoryAmount,detailCategories,categoryMonths,categoryGoalProgress}=await import('../src/budget.js');
 const categories=[{category:'מזון',amount:10},{category:'מזון / סופר ומכולת',amount:100.25},{category:'מזון / מסעדות ובתי קפה',amount:-20.10},{category:'קטגוריה אישית',amount:1}];
 assert.ok(detailCategories.includes('תחבורה / חניה וכבישי אגרה'));assert.equal(categoryAmount(categories,'מזון'),90.15);assert.equal(categoryAmount(categories,'מזון / סופר ומכולת'),100.25);
 assert.equal(categoryRollup(categories).find(c=>c.category==='מזון').amount,90.15);
 const p=base();p.categoryGoals={'מזון':100};p.details=categories.map((r,i)=>({id:'manual-'+i,name:'בדיקה',category:r.category,amount:Math.abs(r.amount),method:'card1',month:'2026-11',date:'2026-10-13',number:'',status:'cleared',accounting:'included'}));
 const before=JSON.stringify(p);assert.equal(categoryGoalProgress(p,'2026-11','מזון','2026-10').amount,130.35);assert.equal(categoryMonths(p,'2026-11','מזון',1)[0].amount,130.35);assert.equal(JSON.stringify(p),before);
});

test('Batch total-only file cannot silently replace a previously detailed statement',async()=>{
 const {applyBillingBatch}=await import('../src/card-statement-model.js');const p=base(),statement=await prepareCardStatement(p,report(),'card1');
 const next=applyBillingBatch(p,[{cardId:'card1',accountId:'a',dueDate:statement.dueDate,amount:statement.amount,statement,choices:choices(statement)}],'2026-10-15');
 assert.throws(()=>applyBillingBatch(next,[{cardId:'card1',accountId:'a',dueDate:statement.dueDate,amount:1}],'2026-10-15'),/כבר נשמר פירוט/);
});

test('One merchant category spans new rows in all batch files, amounts and cards while saved rows retain their categories',async()=>{
 const p=base();p.creditCards.push({id:'card2',name:'נוסף',alias:'',billingDay:15});p.cashPlanning.cardAccounts.card2='a';
 const first=report([{...report().entries[0],merchant:'Example Shop',amountCents:10025}]),second={...report([{...report().entries[0],merchant:'  EXAMPLE   SHOP ',amountCents:2050},{...report().entries[0],merchant:'חנות אחרת',amountCents:500}]),dueDate:'2026-12-15'};
 const preview1=await prepareCardStatement(p,first,'card1'),preview2=await prepareCardStatement(p,second,'card2');preview1.rows[0].category='מזון';preview2.rows[0].category='קניות';
 const c=vm.createContext({window:{addEventListener(){}},app:{addEventListener(){}},batch:[{statement:preview1},{statement:preview2}]});
 vm.runInContext(fs.readFileSync('src/card-statement-model.js','utf8').replaceAll(/^import .*;\n/gm,'').replaceAll(/^export /gm,''),c);vm.runInContext(fs.readFileSync('src/card-billing-client.js','utf8'),c);
 const groups=vm.runInContext('billingBatchGroups(batch)',c);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.equal(groups[0].files.size,2);assert.equal(groups[0].category,'');assert.deepEqual(Array.from(groups[0].rows,r=>r.fileIndex),[0,1]);
 const selected=groups.map(g=>g.merchant==='חנות אחרת'?'אחר':'בילויים / מנויים ודיגיטל'),choicesByFile=[{},{}];groups.forEach((g,i)=>g.rows.forEach(row=>choicesByFile[row.fileIndex][row.id]={category:selected[i]}));
 const {applyBillingBatch}=await import('../src/card-statement-model.js');const next=applyBillingBatch(p,[preview1,preview2].map((statement,i)=>({cardId:statement.cardId,accountId:'a',dueDate:statement.dueDate,amount:statement.amount,statement,choices:choicesByFile[i]})),'2026-10-15');
 assert.equal(next.details.filter(d=>d.category==='בילויים / מנויים ודיגיטל').length,2);assert.equal(next.details.find(d=>d.name==='חנות אחרת').category,'אחר');
 const savedBefore=JSON.stringify(next.details),reimport1=await prepareCardStatement(next,first,'card1'),newer={...first,dueDate:'2027-01-15'},preview3=await prepareCardStatement(next,newer,'card1');
 c.batch=[{statement:reimport1},{statement:preview3}];const remaining=vm.runInContext('billingBatchGroups(batch)',c);assert.equal(remaining.length,1);assert.equal(remaining[0].rows.length,1);assert.equal(remaining[0].files.size,1);
 const last=applyCardStatement(next,preview3,choices(preview3,'מזון'));assert.equal(JSON.stringify(last.details.slice(0,3)),savedBefore);
});

test('Isracard foreign purchase metadata survives import and deduplicates without changing the billed cash total',async()=>{
 const {inspectIsracardPDF}=await import('../tools/bank-csv/isracard-pdf.mjs'),{isracardTextFixture}=await import('../tools/bank-csv/isracard-fixture.mjs'),{validatePlan,createDemoPlan}=await import('../src/budget.js');const {cardStatementCoverage}=await import('../src/card-billing-model.js');const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[];p.cashPlanning={accounts:[{id:'payer',label:'בדיקה',buffer:0,opening:5000}],months:{},cardAccounts:{card2:'payer'},transfers:[]};const report=inspectIsracardPDF(isracardTextFixture()),preview=await prepareCardStatement(p,report,'card2'),choices=Object.fromEntries(preview.rows.map(row=>[row.id,{category:'קניות'}])),next=applyBillingBatch(p,[{cardId:'card2',accountId:'payer',dueDate:report.dueDate,amount:report.amount,statement:preview,choices}],'2026-10-18');assert.equal(validatePlan(next),true);assert.ok(next.details.every(row=>row.id.startsWith('isracard-')&&row.statement.issuer==='isracard'));assert.equal(next.details.reduce((sum,row)=>sum+Math.round(row.amount*100),0),5600);assert.equal(next.details[0].statement.originalCurrency,'EUR');assert.equal(next.details[0].statement.foreignCents,1000);assert.equal(cardStatementCoverage(next,2026,'2026-10').find(row=>row.card.id==='card2').months.find(row=>row.month==='2026-10').state,'file');const again=await prepareCardStatement(next,report,'card2');assert.ok(again.rows.every(row=>row.existing));assert.equal(applyCardStatement(next,again,{}).details.length,3);assert.deepEqual(p.details,[]);
});

test('Isracard changed original foreign evidence is not silently considered an identical reimport',async()=>{const {createDemoPlan}=await import('../src/budget.js');const p=createDemoPlan('2026-10');p.demo=false;p.details=[];const report={issuer:'isracard',dueDate:'2026-10-15',amount:40,entries:[{date:'2026-09-01',merchant:'EXAMPLE',amountCents:4000,originalCents:4000,notes:'',originalCurrency:'EUR',foreignCents:1000,page:1}]},first=await prepareCardStatement(p,report,'card2'),next=applyCardStatement(p,first,{[first.rows[0].id]:{category:'אחר'}}),changed=structuredClone(report);changed.entries[0].foreignCents=1100;await assert.rejects(prepareCardStatement(next,changed,'card2'),/שונה/);});
