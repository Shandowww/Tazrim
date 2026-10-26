import test from 'node:test';
import assert from 'node:assert/strict';
import {zero,clone,validatePlan,forecast,cashAccountForecast} from '../src/budget.js';
import {bankIdentity,bankPreview,bankDefaultMonthModes,bankPlannedDirect,bankImportedSavingSummary,bankReviewGroups,bankRememberedRules,applyBankImport,undoBankImport,excludeInternalBankTransfers} from '../src/bank-import-model.js';
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:12,defaults:{...zero(),salary:700,variable:50},months:{},expenses:[],demo:false});
const row=(line,date,reference,amountCents,description,extra={})=>({line,date,reference,amountCents,description,valid:true,currency:'ILS',balanceCents:null,details:'',beneficiary:'',purpose:'',...extra});
const records=async rows=>Promise.all(rows.map(r=>bankIdentity(r,'personal')));
const options=(rows,extra={})=>({id:'batch1',accountId:'personal',label:'אישי',fileName:'test.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,rules:[],modes:{'2026-02':'full'},choices:Object.fromEntries(rows.map(r=>[r.line,{field:r.amountCents>0?'salary':'card1',reviewed:true}])),...extra});
test('Reviewed import replaces only mapped monthly totals, anchors cash, validates and reverses exactly',async()=>{
 const p=base(),before=clone(p),r=await records([row(1,'2026-02-02','1',100000,'משכורת'),row(2,'2026-02-28','2',-20000,'כאל',{balanceCents:180000})]);
 const next=applyBankImport(p,r,options(r));assert.deepEqual(p,before);assert.equal(validatePlan(next),true);
 assert.equal(next.months['2026-02'].values.salary,1000);assert.equal(next.months['2026-02'].values.card1,200);assert.equal(next.months['2026-02'].values.variable,50);
 assert.equal(forecast(next)[1].balance,1800);assert.equal(next.bankImport.entries.length,2);
 const undone=undoBankImport(next,'batch1');delete undone.bankImport;assert.deepEqual(undone,p);
 next.months['2026-02'].values.variable=60;assert.throws(()=>undoBankImport(next,'batch1'),/השתנו/);
});
test('Confirmed internal transfers leave spending without changing bank evidence or the reported cash anchor',async()=>{
 const amounts=[40000,5019,5000,7000],rows=await records(amounts.map((amount,i)=>row(i+1,`2026-04-${String(i+3).padStart(2,'0')}`,String(i+1),-amount*100,'העברה',{balanceCents:i===3?123456:null})));
 const imported=applyBankImport(base(),rows,options(rows,{from:'2026-04-01',to:'2026-04-30',modes:{'2026-04':'full'},choices:Object.fromEntries(rows.map(r=>[r.line,{field:'transfers',reviewed:true}]))}));
 const before=clone(imported),beforeFlow=forecast(imported),corrected=excludeInternalBankTransfers(imported,'2026-04');
 assert.deepEqual(imported,before);assert.equal(corrected.months['2026-04'].values.transfers,0);assert.equal(corrected.bankImport.entries.length,4);assert.ok(corrected.bankImport.entries.every(entry=>entry.field==='outgoingTransfers'&&entry.source.description==='העברה'));
 assert.equal(forecast(corrected).find(r=>r.month==='2026-04').spending,50);assert.equal(forecast(corrected).find(r=>r.month==='2026-04').balance,beforeFlow.find(r=>r.month==='2026-04').balance);assert.equal(forecast(corrected).find(r=>r.month==='2026-05').balance-beforeFlow.find(r=>r.month==='2026-05').balance,57019);assert.equal(corrected.months['2026-04'].cashReport.balance,imported.months['2026-04'].cashReport.balance);assert.equal(validatePlan(corrected),true);
 assert.throws(()=>undoBankImport(corrected,'batch1'),/השתנו/);
 const mismatched=clone(imported);mismatched.months['2026-04'].values.transfers+=1;assert.throws(()=>excludeInternalBankTransfers(mismatched,'2026-04'),/תואם בדיוק/);
});
test('Internal-transfer correction also updates an assigned cash-account report without changing its bank balance',async()=>{
 const p=base();p.cashPlanning={accounts:[{id:'personal',label:'אישי',opening:1000,buffer:0,defaults:zero()}],months:{'2026-04':{personal:{values:zero(),actual:false,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]};
 const rows=await records([row(1,'2026-04-20','internal',-500000,'העברה',{balanceCents:130000})]),imported=applyBankImport(p,rows,options(rows,{from:'2026-04-01',to:'2026-04-30',modes:{'2026-04':'full'},choices:{1:{field:'transfers',reviewed:true}}}));
 const before=cashAccountForecast(imported,'personal').find(r=>r.month==='2026-04'),corrected=excludeInternalBankTransfers(imported,'2026-04'),after=cashAccountForecast(corrected,'personal').find(r=>r.month==='2026-04');
 assert.equal(corrected.cashPlanning.months['2026-04'].personal.values.transfers,0);assert.equal(after.spending,before.spending-5000);assert.equal(after.balance,before.balance);assert.equal(validatePlan(corrected),true);
});
test('Overlapping full reports combine old and new references without charging existing rows again',async()=>{
 const r=await records([row(1,'2026-02-02','1',100000,'משכורת')]),first=applyBankImport(base(),r,options(r));
 const overlap=await records([row(5,'2026-02-02','1',100000,'משכורת'),row(6,'2026-02-28','2',-20000,'כאל')]);
 const next=applyBankImport(first,overlap,options(overlap,{id:'batch2'}));assert.equal(next.months['2026-02'].values.salary,1000);assert.equal(next.bankImport.entries.length,2);
 assert.throws(()=>applyBankImport(next,overlap,options(overlap,{id:'batch3'})),/בלי תנועות חדשות/);
 const conflicting=await records([row(8,'2026-02-02','1',120000,'משכורת')]);assert.equal(bankPreview(first,conflicting,options(conflicting)).rows[0].state,'conflict');assert.throws(()=>applyBankImport(first,conflicting,options(conflicting,{id:'conflict'})));
});
test('Partial periods cannot overwrite actual months or mark achievements; unreviewed rows block selected months',async()=>{
 const r=await records([row(1,'2026-02-12','1',100000,'משכורת',{balanceCents:150000})]);
 assert.throws(()=>applyBankImport(base(),r,options(r,{to:'2026-02-12'})),/חלקי/);
 const o=options(r,{to:'2026-02-12',modes:{'2026-02':'partial'}}),next=applyBankImport(base(),r,o);
 assert.equal(next.months['2026-02'].actual,false);assert.equal(forecast(next)[1].balance,1500);
 const p=base();p.months['2026-02']={values:zero(),actual:true,includesPlannedCard:false};assert.throws(()=>applyBankImport(p,r,o),/מלא קיים/);
 assert.throws(()=>applyBankImport(base(),r,{...o,choices:{}}),/בדיקת/);
 assert.throws(()=>applyBankImport(base(),r,{...o,coverageConfirmed:false}));
});
test('Card totals exclude included planned card payments and direct expenses require separate review',async()=>{
 const p=base();p.expenses=[{id:'card',name:'card',firstMonth:'2026-02',payments:1,amount:100,fees:0,source:'card',kind:'expense'},{id:'direct',name:'direct',firstMonth:'2026-02',payments:1,amount:50,fees:0,source:'direct',kind:'expense'}];
 const r=await records([row(1,'2026-02-28','1',-20000,'כאל')]);
 assert.throws(()=>applyBankImport(p,r,options(r)),/תכנון קיים/);
 const next=applyBankImport(p,r,options(r,{directIncluded:{'2026-02':false}}));assert.equal(forecast(next)[1].planned,50);
 const included=applyBankImport(p,r,options(r,{directIncluded:{'2026-02':true}}));assert.equal(forecast(included)[1].planned,0);
});
test('Budget validation rejects corrupt registries and account isolation yields separate identities',async()=>{
 const r=await records([row(1,'2026-02-12','1',10000,'משכורת')]),next=applyBankImport(base(),r,options(r));
 const other=await bankIdentity(r[0],'other');assert.notEqual(other.key,r[0].key);
 const corrupt=clone(next);corrupt.bankImport.entries.push(corrupt.bankImport.entries[0]);assert.equal(validatePlan(corrupt),false);
});
test('Repeated rows within a file contribute once, and partial history does not become next month estimates',async()=>{
 const r=await records([row(1,'2026-02-12','1',100000,'משכורת'),row(2,'2026-02-12','1',100000,'משכורת')]);
 const next=applyBankImport(base(),r,options(r,{to:'2026-02-12',modes:{'2026-02':'partial'}}));
 assert.equal(next.months['2026-02'].values.salary,1000);assert.equal(next.bankImport.entries.length,1);
 assert.equal(forecast(next)[2].income,700);
});
test('Later partial statements accumulate previously imported rows without counting overlap twice',async()=>{
 const firstRows=await records([row(1,'2026-02-02','1',-10000,'כאל')]),first=applyBankImport(base(),firstRows,options(firstRows,{to:'2026-02-12',modes:{'2026-02':'partial'}}));
 const secondRows=await records([row(2,'2026-02-02','1',-10000,'כאל'),row(3,'2026-02-15','2',-20000,'כאל')]);
 const second=applyBankImport(first,secondRows,options(secondRows,{id:'second',to:'2026-02-20',modes:{'2026-02':'partial'}}));
 assert.equal(second.months['2026-02'].values.card1,300);assert.equal(second.bankImport.entries.length,2);
});

test('CSV import round-trips the authenticated SQLite storage without scaling or altering older months',async()=>{
 const {inspectCSV,normalizeRows}=await import('../tools/bank-csv/parser.mjs');
 const {openDatabase}=await import('../server/database.mjs');
 const worker=(await import('../dist/server/index.js')).default;
 const {db,DB}=openDatabase(':memory:');
 try{
  const p=base();p.months['2026-01']={values:{...zero(),salary:1234.56,loanRepayment:987.65},actual:true,includesPlannedCard:false};
  const oldMonth=JSON.stringify(p.months['2026-01']);
  const parsed=normalizeRows(inspectCSV('תאריך,הפעולה,אסמכתא,חובה,זכות,יתרה\n12/02/2026,החזר הלוואה,1,"1.000,25",,"-500,25"\n13/02/2026,משכורת,2,,"20,000.50","19.000,25"'));
  const r=await records(parsed.records),next=applyBankImport(p,r,options(r,{choices:Object.fromEntries(r.map(r=>[r.line,{field:r.amountCents<0?'loanRepayment':'salary',reviewed:true}]))}));
  const headers={'oai-authenticated-user-id':'test-import','oai-authenticated-user-email':'test@example.invalid','content-type':'application/json',origin:'https://budget.test'};
  const response=await worker.fetch(new Request('https://budget.test/api/plan',{method:'PUT',headers,body:JSON.stringify({plan:next,revision:0})}),{DB});
  assert.equal(response.status,200);
  const loaded=await (await worker.fetch(new Request('https://budget.test/api/plan',{headers}),{DB})).json();
  assert.deepEqual(loaded.plan,next);assert.equal(JSON.stringify(loaded.plan.months['2026-01']),oldMonth);
  assert.equal(loaded.plan.months['2026-02'].values.loanRepayment,1000.25);
  assert.equal(loaded.plan.months['2026-02'].cashReport.balance,19000.25);
  assert.equal(loaded.plan.bankImport.entries[0].cents,-100025);
  assert.throws(()=>applyBankImport(loaded.plan,r,options(r,{id:'repeat'})),/בלי תנועות חדשות/);
 }finally{db.close();}
});

test('Review groups use action and beneficiary, ignoring varying amounts, dates and details while preserving direction',()=>{
 const rows=[
  {...row(1,'2026-02-01','1',-10000,'העברה',{beneficiary:'מוטב א',details:'פירוט 1',purpose:'א'}),state:'new',reviewed:false,field:'transfers'},
  {...row(2,'2026-03-02','2',-25025,' העברה ',{beneficiary:'מוטב  א',details:'פירוט אחר',purpose:'ב'}),state:'new',reviewed:false,field:'variable'},
  {...row(3,'2026-02-02','3',-90000,'העברה',{beneficiary:'מוטב ב'}),state:'new',reviewed:false,field:'transfers'},
  {...row(4,'2026-02-02','4',10000,'העברה',{beneficiary:'מוטב א'}),state:'new',reviewed:false,field:'otherIncome'},
  {...row(5,'2026-02-02','5',-10000,'עמלה',{beneficiary:'מוטב א'}),state:'new',reviewed:true,field:'variable'}
 ];
 const before=JSON.stringify(rows),groups=bankReviewGroups(rows);
 assert.equal(groups.length,4);assert.deepEqual(groups[0].rows.map(r=>r.line),[1,2]);
 assert.equal(groups[0].totalCents,-35025);assert.equal(groups[0].minCents,-25025);assert.equal(groups[0].maxCents,-10000);
 assert.equal(groups[0].from,'2026-02-01');assert.equal(groups[0].to,'2026-03-02');assert.equal(groups[0].mixed,true);assert.equal(groups[0].field,'');
 assert.equal(groups[2].direction,'in');assert.equal(groups[3].pending.length,0);assert.equal(JSON.stringify(rows),before);
});
test('Duplicate, conflicting and invalid rows are never eligible for group approval; anonymous rows stay separate',()=>{
 const rows=['duplicate','duplicate-file','conflict','invalid'].map((state,i)=>({...row(i,'2026-02-02','1',-10000,'העברה'),state}));
 rows.push(...[10,11].map(line=>({...row(line,'2026-02-02',String(line),-10000,''),state:'new',reviewed:false})));
 const groups=bankReviewGroups(rows);assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.rows.length),[1,1]);
});

test('Default import months select complete and eligible partial periods while guarding existing actual, old, future and duplicate-only months',async()=>{
 const p=base();p.startMonth='2026-02';p.months['2026-03']={values:zero(),actual:true,includesPlannedCard:false};
 const months=[
  {month:'2026-01',complete:true,newCount:1},
  {month:'2026-02',complete:true,newCount:1},
  {month:'2026-03',complete:false,newCount:1},
  {month:'2026-04',complete:false,newCount:1},
  {month:'2026-05',complete:true,newCount:0},
  {month:'2026-11',complete:true,newCount:1}
 ];
 assert.deepEqual(bankDefaultMonthModes(p,{months},'2026-10'),{'2026-01':'skip','2026-02':'full','2026-03':'skip','2026-04':'partial','2026-05':'skip','2026-11':'skip'});
 assert.equal(bankDefaultMonthModes(p,{months:[{month:'2026-03',complete:true,newCount:1}]},'2026-10')['2026-03'],'full');
 const r=await records([row(1,'2026-02-12','1',-100025,'העברה')]);
 const o=options(r,{modes:{}}),preview=bankPreview(p,r,o);o.modes=bankDefaultMonthModes(p,preview,'2026-10');
 const next=applyBankImport(p,r,o);assert.equal(next.months['2026-02'].values.card1,1000.25);
 o.choices={};assert.throws(()=>applyBankImport(p,r,o),/בדיקת/);
 o.choices=options(r).choices;o.modes['2026-02']='skip';assert.throws(()=>applyBankImport(p,r,o),/בחר לפחות/);
});

test('Planned direct choices are required only for applicable monthly items; filtered reports cannot become full reports',async()=>{
 const p=base();p.expenses=[{id:'direct',name:'ביטוח',firstMonth:'2026-02',payments:1,amount:500,fees:0,source:'direct',kind:'expense'},{id:'future',name:'עתידי',firstMonth:'2026-03',payments:1,amount:100,fees:0,source:'direct',kind:'income'},{id:'card',name:'כרטיס',firstMonth:'2026-02',payments:1,amount:200,fees:0,source:'card',kind:'expense'}];
 assert.deepEqual(bankPlannedDirect(p,'2026-02'),[{id:'direct',name:'ביטוח',kind:'expense',amount:500}]);
 const r=await records([row(1,'2026-02-12','1',-100000,'העברה')]),o=options(r,{directIncluded:{'2026-02':true}});
 assert.throws(()=>applyBankImport(p,r,{...o,directIncluded:{}}),/כבר כלול בדוח/);
 assert.throws(()=>applyBankImport(p,r,{...o,reportScope:'partial'}),/חלקי/);
 assert.equal(bankDefaultMonthModes(p,bankPreview(p,r,o),'2026-10','partial')['2026-02'],'partial');
 const next=applyBankImport(p,r,{...o,reportScope:'partial',modes:{'2026-02':'partial'}});assert.equal(next.months['2026-02'].actual,false);
 assert.equal(forecast(applyBankImport(p,r,o))[1].planned,0);
 assert.equal(forecast(applyBankImport(p,r,{...o,directIncluded:{'2026-02':false}}))[1].planned,500);
});

test('Bank savings summary explains deposits without inventing balances or including investments',()=>{
 const p=base();p.bankImport={entries:[{field:'personalSaving',cents:-100025,month:'2026-02'},{field:'sharedSaving',cents:-200050,month:'2026-03'},{field:'personalInvest',cents:-900000,month:'2026-03'},{field:'exclude',cents:-8000,month:'2026-01'}]};
 const before=JSON.stringify(p);assert.deepEqual(bankImportedSavingSummary(p),{count:2,totalCents:300075,from:'2026-02',to:'2026-03'});assert.equal(JSON.stringify(p),before);
});
test('Two bank accounts combine monthly fields and matching-date balances, preserve identities and undo precisely',async()=>{
 const a=await records([row(1,'2026-02-28','same-ref',100000,'משכורת',{balanceCents:500000})]),first=applyBankImport(base(),a,options(a,{bankName:'hapoalim'}));
 const b=await Promise.all([row(2,'2026-02-28','same-ref',200025,'משכורת',{balanceCents:300050})].map(r=>bankIdentity(r,'one-zero-account')));
 const o=options(b,{id:'bank2',accountId:'one-zero-account',label:'וואן זירו',bankName:'one-zero'}),combined=applyBankImport(first,b,o);
 assert.equal(combined.months['2026-02'].values.salary,3000.25);assert.equal(combined.months['2026-02'].cashReport.balance,8000.5);assert.equal(combined.bankImport.entries.length,2);assert.notEqual(combined.bankImport.entries[0].key,combined.bankImport.entries[1].key);
 assert.equal(combined.bankImport.accounts[1].bankName,'one-zero');assert.deepEqual(undoBankImport(combined,'bank2'),first);
 const aMore=await records([row(1,'2026-02-28','same-ref',100000,'משכורת',{balanceCents:500000}),row(3,'2026-02-28','another-ref',50000,'משכורת',{balanceCents:500000})]);
 const updated=applyBankImport(combined,aMore,options(aMore,{id:'bank1-update'}));assert.equal(updated.months['2026-02'].values.salary,3500.25);assert.equal(updated.months['2026-02'].cashReport.balance,8000.5);
});
test('Multi-account import never invents a combined balance from different dates or declares an incomplete aggregate actual',async()=>{
 const a=await records([row(1,'2026-02-12','1',100000,'משכורת',{balanceCents:500000})]),first=applyBankImport(base(),a,options(a,{to:'2026-02-12',modes:{'2026-02':'partial'}}));
 const b=await Promise.all([row(2,'2026-02-28','2',200000,'משכורת',{balanceCents:300000})].map(r=>bankIdentity(r,'bank2'))),next=applyBankImport(first,b,options(b,{accountId:'bank2',id:'second-bank'}));
 assert.equal(next.months['2026-02'].values.salary,3000);assert.equal(next.months['2026-02'].actual,false);assert.equal(next.months['2026-02'].cashReport,undefined);
 assert.equal(next.months['2026-02'].bankCoverage.sourceBalanceCents,300000);assert.equal(next.months['2026-02'].bankCoverage.accountComplete,true);
});

test('Multi-bank balance sources retain the exact reading date when the report ends later',async()=>{
 const a=await records([row(1,'2026-02-12','a',100000,'משכורת',{balanceCents:500000})]),first=applyBankImport(base(),a,options(a));
 assert.equal(first.months['2026-02'].bankCoverage.date,'2026-02-12');
 const b=await Promise.all([row(2,'2026-02-12','b',200000,'משכורת',{balanceCents:300000})].map(r=>bankIdentity(r,'bank2'))),next=applyBankImport(first,b,options(b,{accountId:'bank2',id:'bank2'}));
 assert.equal(next.months['2026-02'].cashReport.balance,8000);assert.equal(next.months['2026-02'].bankCoverage.date,'2026-02-12');
});
test('Without reference, identical transactions are blocked for reconciliation rather than silently merged or counted twice',async()=>{
 const r=await records([row(1,'2026-02-12','',-10000,'העברה',{balanceCents:50000}),row(2,'2026-02-12','',-10000,'העברה',{balanceCents:40000})]);const o=options(r),p=base();
 const preview=bankPreview(p,r,o);assert.deepEqual(preview.rows.map(r=>r.state),['conflict','conflict']);assert.throws(()=>applyBankImport(p,r,o),/בדיקת/);
 const first=applyBankImport(p,[r[0]],options([r[0]]));const more=await records([row(3,'2026-02-12','',-10000,'העברה'),row(4,'2026-02-15','new',-20000,'עמלה')]);assert.throws(()=>applyBankImport(first,more,options(more,{id:'overlap'})),/בדיקת/);
});
test('A reviewed cancellation subtracts from its original expense field, stays signed in the registry, and never inflates savings',async()=>{
 const r=await records([row(1,'2026-02-12','debit',-100025,'חיוב'),row(2,'2026-02-13','refund',100025,'ביטול חיוב',{reversal:true}),row(3,'2026-02-14','new',-5000,'חיוב נוסף')]),o=options(r,{choices:{1:{field:'personalSaving',reviewed:true},2:{field:'personalSaving',reviewed:true},3:{field:'personalSaving',reviewed:true}}});
 const n=applyBankImport(base(),r,o);assert.equal(n.months['2026-02'].values.personalSaving,50);assert.equal(n.bankImport.entries[1].cents,100025);assert.equal(bankImportedSavingSummary(n).totalCents,5000);
 const over=await records([row(1,'2026-02-12','refund',100025,'ביטול',{reversal:true})]);assert.throws(()=>applyBankImport(base(),over,options(over,{choices:{1:{field:'variable',reviewed:true}}})),/גדול מהחיובים/);
});
test('Overlapping reference-free PDF and spreadsheet exports cannot count the same movements under changed descriptions',async()=>{
 const first=await records([row(1,'2026-02-12','',-10000,'תיאור מה־XLS')]),p=applyBankImport(base(),first,options(first,{fileName:'bank.xls'})),pdf=await records([row(2,'2026-02-12','',-10000,'תיאור מפורט מה־PDF')]);
 assert.equal(bankPreview(p,pdf,options(pdf,{fileName:'bank.pdf'})).rows[0].state,'conflict');assert.throws(()=>applyBankImport(p,pdf,options(pdf,{id:'pdf2',fileName:'bank.pdf'})),/בדיקת/);
});
test('Verified PDF row order resolves several balance readings on the same date without guessing Excel ordering',async()=>{
 const rows=await records([row(1,'2026-02-28','1',-10000,'חיוב',{balanceCents:90000,pdfOrder:2}),row(2,'2026-02-28','2',-20000,'חיוב נוסף',{balanceCents:70000,pdfOrder:3})]);
 const p=applyBankImport(base(),rows,options(rows));assert.equal(p.months['2026-02'].cashReport.balance,700);
 for(const r of rows)delete r.pdfOrder;assert.equal(bankPreview(base(),rows,options(rows)).months[0].sourceBalance,null);
});
test('An ordinary bank credit needs an explicit refund choice to reduce cards, saving deposits or loan payments',async()=>{
 const r=await records([row(1,'2026-02-12','charge',-10000,'חיוב'),row(2,'2026-02-13','credit',2500,'זיכוי')]);
 for(const field of ['card2','personalSaving','loanRepayment']){const choices={1:{field,reviewed:true},2:{field,reviewed:true}},o=options(r,{choices});assert.throws(()=>applyBankImport(base(),r,o),/בדיקת/);choices[2].refund=true;const n=applyBankImport(base(),r,o);assert.equal(n.months['2026-02'].values[field],75);assert.equal(n.months['2026-02'].values.otherIncome,0);assert.equal(n.bankImport.entries[1].cents,2500);}
});

test('Remembered group rules ignore amounts, preserve input, honor opt-out and reject mixed mappings',()=>{const records=[row(1,'2026-02-01','1',-10000,'העברה',{beneficiary:'מוטב'}),row(2,'2026-02-02','2',-99999,'העברה',{beneficiary:'מוטב'})],choices={1:{field:'personalSaving',reviewed:true,manual:true},2:{field:'personalSaving',reviewed:true,manual:true}},rules=[];const learned=bankRememberedRules(rules,records,choices);assert.equal(learned.length,1);assert.equal(learned[0].action,'העברה');assert.equal(learned[0].beneficiary,'מוטב');assert.equal(rules.length,0);assert.deepEqual(bankRememberedRules([],records,choices,false),[]);choices[2].field='transfers';assert.deepEqual(bankRememberedRules(learned,records,choices),[]);});
