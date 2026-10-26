import test from 'node:test';import assert from 'node:assert/strict';import {graphWindow,graphTimeline,createDemoPlan,forecast,reportedMonthlySpending,monthlySpendingBreakdown,monthlyExpenseFieldEvidence,cents} from '../src/budget.js';
test('Month and year ranges are inclusive and cross year boundaries without day-level interpolation',()=>{assert.deepEqual(graphWindow(12,'months','2026-10'),{startMonth:'2025-11',endMonth:'2026-10'});assert.deepEqual(graphWindow(2,'years','2026-10'),{startMonth:'2024-11',endMonth:'2026-10'});assert.deepEqual(graphWindow(1,'months','2026-02'),{startMonth:'2026-02',endMonth:'2026-02'});for(const args of [[1,'days','2026-10'],[0,'months','2026-10'],[1,'years','2026-13']])assert.throws(()=>graphWindow(...args));});
test('Comparison metrics reconcile with cash flow; planned amounts are included once and contributions stay separate',()=>{const p=createDemoPlan('2026-10'),window=graphWindow(12,'months','2027-03'),timeline=graphTimeline(p,{...window,asOf:'2026-10',includeEstimates:true}),flow=forecast(p);for(const row of timeline){const f=flow.find(r=>r.month===row.month);if(!f)continue;assert.equal(cents(row.values.net),cents(f.net));assert.equal(cents(row.values.income)-cents(row.values.spending)-cents(row.values.saving)-cents(row.values.invest),cents(f.net));assert.equal(cents(row.values.saving)+cents(row.values.invest),cents(f.saving));assert.equal(cents(row.values.plannedExpense)-cents(row.values.plannedIncome),cents(f.planned));}assert.equal(timeline.find(r=>r.month==='2027-02').estimated,true);});
test('Missing or future actual data is a gap, estimates are explicit, and pending monthly edits never become actual points',()=>{const p=createDemoPlan('2026-10'),window=graphWindow(12,'months','2026-12');p.months['2026-11'].actual=true;const rows=graphTimeline(p,{...window,asOf:'2026-10',excludeMonth:'2026-10'});assert.equal(rows.find(r=>r.month==='2026-01').values.income,null);assert.equal(rows.find(r=>r.month==='2026-10').values.income,null);assert.equal(rows.find(r=>r.month==='2026-11').values.income,null);p.months['2026-09'].values.otherIncome=0;p.months['2026-09'].values.salary=0;p.expenses=p.expenses.filter(e=>e.kind!=='income');assert.equal(graphTimeline(p,{...window,asOf:'2026-10'}).find(r=>r.month==='2026-09').values.income,0);});

import {graphTopExpenses,zero} from '../src/budget.js';
test('Peak expenses rank monthly installment amounts and details, excluding refunds, cancelled cheques and included plans',()=>{
 const p=createDemoPlan('2026-10');p.details=[
  {id:'rent',name:'שכירות',category:'דיור',amount:4000,month:'2026-10',status:'cleared',accounting:'included',method:'variable'},
  {id:'refund',name:'זיכוי',category:'קניות',amount:-100,month:'2026-10',status:'cleared',accounting:'included',method:'card1'},
  {id:'cancel',name:'בוטל',category:'אחר',amount:99999,month:'2026-10',status:'cancelled',accounting:'additional',method:'checks'},
  {id:'cheque',name:'גן',category:'חינוך',amount:3000,month:'2026-10',status:'pending',accounting:'additional',method:'checks'},
  {id:'old',name:'ישן',category:'אחר',amount:90000,month:'2026-09',status:'cleared',accounting:'included',method:'card1'}];
 p.expenses=[{id:'split',name:'ריהוט',amount:12000,fees:0,firstMonth:'2026-10',payments:12,source:'direct',kind:'expense'},
 {id:'card',name:'כבר בכרטיס',amount:10000,fees:0,firstMonth:'2026-10',payments:1,source:'card',kind:'expense'},
 {id:'income',name:'הכנסה',amount:90000,fees:0,firstMonth:'2026-10',payments:1,source:'direct',kind:'income'}];
 const before=structuredClone(p),result=graphTopExpenses(p,'2026-10');assert.deepEqual(result.items.map(e=>[e.id,e.amount]),[['rent',4000],['cheque',3000],['split',1000]]);assert.equal(result.explained,7900);assert.deepEqual(p,before);
 p.months['2026-10'].includesPlannedDirect=true;assert.deepEqual(graphTopExpenses(p,'2026-10').items.map(e=>e.id),['rent','cheque']);
 assert.deepEqual(graphTopExpenses(p,'2026-10',{plannedOnly:true}).items.map(e=>e.id),['cheque','split']);
});
test('Monthly aggregates without detail are never invented as individual peak expenses',()=>{
 const p=createDemoPlan('2026-10');p.details=[];p.expenses=[];p.months['2026-10'].values={...zero(),card1:8000};assert.deepEqual(graphTopExpenses(p,'2026-10'),{categories:[],items:[],explained:0});
 assert.equal(graphTimeline(p,{startMonth:'2026-10',endMonth:'2026-10',asOf:'2026-10'})[0].values.spending,8000);
});
test('Reported monthly spending stays separate from a large planned item in the chart and overview',()=>{
 const p=createDemoPlan('2026-10');p.months['2026-09'].values={...zero(),card1:14048.73};p.expenses=[{id:'plan',name:'תכנון חד־פעמי',amount:48000,fees:0,firstMonth:'2026-09',payments:1,source:'direct',kind:'expense'}];p.details=[];
 const row=graphTimeline(p,{startMonth:'2026-09',endMonth:'2026-09',asOf:'2026-10'})[0];
 assert.equal(reportedMonthlySpending(p,'2026-09'),14048.73);
 assert.equal(row.values.reportedSpending,14048.73);
 assert.equal(row.values.spending,62048.73);
 const breakdown=monthlySpendingBreakdown(p,'2026-09');
 assert.deepEqual(breakdown.reported,[{key:'card1',label:'כרטיס מזרחי / הפועלים',amount:14048.73}]);
 assert.deepEqual(breakdown.planned,[{label:'תכנון חד־פעמי',amount:48000}]);
 assert.equal(breakdown.total,row.values.spending);
 assert.deepEqual(graphTopExpenses(p,'2026-09',{reportedOnly:true}).items,[]);
 assert.equal(graphTopExpenses(p,'2026-09').items[0].amount,48000);
});
test('A large transfer field exposes imported source rows and separates an unmatched monthly remainder without changing totals',()=>{
 const p=createDemoPlan('2026-10');p.months['2026-04'].values={...zero(),card1:5282.96,transfers:57019};p.bankImport={accounts:[{id:'bank',label:'חשבון בנק'}],entries:[{month:'2026-04',field:'transfers',accountId:'bank',cents:-5000000,source:{date:'2026-04-06',description:'העברה',beneficiary:'חשבון אחר'}},{month:'2026-04',field:'transfers',accountId:'bank',cents:-701900,source:{date:'2026-04-09',description:'העברה נוספת',beneficiary:''}}]};
 const before=JSON.stringify(p),evidence=monthlyExpenseFieldEvidence(p,'2026-04','transfers');
 assert.equal(evidence.reported,57019);assert.equal(evidence.imported,57019);assert.equal(evidence.unlinked,0);assert.deepEqual(evidence.records.map(row=>row.amount),[50000,7019]);
 assert.equal(JSON.stringify(p),before);
 p.bankImport.entries.pop();assert.equal(monthlyExpenseFieldEvidence(p,'2026-04','transfers').unlinked,7019);assert.throws(()=>monthlyExpenseFieldEvidence(p,'2026-04','salary'));
});
test('A legacy bank transfer without retained source details still opens as monthly evidence',()=>{
 const p=createDemoPlan('2026-10');p.months['2026-04'].values={...zero(),transfers:5000};p.bankImport={accounts:[{id:'bank',label:'חשבון בנק'}],entries:[{month:'2026-04',field:'transfers',accountId:'bank',cents:-500000}]};
 const result=monthlyExpenseFieldEvidence(p,'2026-04','transfers');
 assert.equal(result.imported,5000);assert.equal(result.unlinked,0);
 assert.deepEqual(result.records,[{date:null,description:'',beneficiary:'',account:'חשבון בנק',amount:5000}]);
});
