import test from 'node:test';
import assert from 'node:assert/strict';
import {assignBankMovementCategory,bankCategoryCoverage,categoryRegistryEntry,clone,createDemoPlan,monthlyMetricSnapshot,possibleBankDetailMatches,validatePlan,zero} from '../src/budget.js';
import {financialProjection} from '../server/financial-data.mjs';

const source={date:'2026-04-12',description:'בית עסק',details:'',beneficiary:'',purpose:'',reference:'',currency:'ILS'};
const plan=()=>{
 const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[];
 p.months['2026-04']={values:{...zero(),variable:200,card1:300},actual:true,includesPlannedCard:false};
 p.bankImport={version:1,accounts:[{id:'own',label:'חשבון',rules:[]}],batches:[{id:'batch',accountId:'own',file:'test.csv',from:'2026-04-01',to:'2026-04-30',months:[]}],entries:[
  {key:'a'.repeat(64),fingerprint:'1'.repeat(64),month:'2026-04',field:'variable',cents:-20000,accountId:'own',batchId:'batch',source},
  {key:'b'.repeat(64),fingerprint:'2'.repeat(64),month:'2026-04',field:'card1',cents:-30000,accountId:'own',batchId:'batch',source},
  {key:'c'.repeat(64),fingerprint:'3'.repeat(64),month:'2026-04',field:'exclude',cents:-4000000,accountId:'own',batchId:'batch',source}
 ]};return p;
};

test('categorizing a source-backed bank debit preserves the report total and transaction amount',()=>{
 const p=plan(),before=clone(p),total=monthlyMetricSnapshot(p,'reported-spending','2026-04').valueCents;
 assert.equal(validatePlan(p),true);
 const next=assignBankMovementCategory(p,'a'.repeat(64),'מזון / סופר ומכולת');
 assert.deepEqual(p,before);assert.equal(validatePlan(next),true);
 assert.equal(monthlyMetricSnapshot(next,'reported-spending','2026-04').valueCents,total);
 const id=categoryRegistryEntry(next,'מזון / סופר ומכולת').id,transaction=financialProjection(next).transactions.find(row=>row.id==='bank:'+'a'.repeat(64));
 assert.equal(transaction.category_id,id);assert.equal(transaction.amount_cents,-20000);
 assert.deepEqual(bankCategoryCoverage(next,'2026-04'),{month:'2026-04',count:1,categorizedCount:1,totalCents:20000,categorizedCents:20000,unclassifiedCents:0,categories:[{id,label:'מזון / סופר ומכולת',cents:20000}]});
 assert.equal(financialProjection(next).transactions.find(row=>row.id==='bank:'+'b'.repeat(64)).category_id,null);
 const cleared=assignBankMovementCategory(next,'a'.repeat(64),'');assert.equal(cleared.bankImport.entries[0].bankCategoryId,undefined);
 assert.equal(monthlyMetricSnapshot(cleared,'reported-spending','2026-04').valueCents,total);
});

test('card settlement, internal transfer, missing source and unknown categories cannot be bank purchases',()=>{
 const p=plan();assert.throws(()=>assignBankMovementCategory(p,'b'.repeat(64),'מזון'));assert.throws(()=>assignBankMovementCategory(p,'c'.repeat(64),'מזון'));
 assert.throws(()=>assignBankMovementCategory(p,'a'.repeat(64),'קטגוריה חדשה'));
 const noSource=clone(p);delete noSource.bankImport.entries[0].source;assert.throws(()=>assignBankMovementCategory(noSource,'a'.repeat(64),'מזון'));
 const invalid=clone(p);invalid.bankImport.entries[1].bankCategoryId='cat_11111111-1111-4111-8111-111111111111';assert.equal(validatePlan(invalid),false);
});

test('nearby matching direct detail is only a review hint and cannot merge or change totals',()=>{
 const p=plan();p.details=[{id:'same',name:'קנייה ידנית',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'},
  {id:'card',name:'חיוב כרטיס',category:'מזון',method:'card1',amount:200,month:'2026-04',date:'2026-04-12',number:'',status:'cleared',accounting:'included'},
  {id:'far',name:'תשלום רחוק',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-03-01',number:'',status:'cleared',accounting:'included'}];
 const before=clone(p),bank=p.bankImport.entries[0];
 assert.deepEqual(possibleBankDetailMatches(p,bank),[{id:'same',name:'קנייה ידנית',date:'2026-04-10',category:'מזון'}]);
 assert.deepEqual(possibleBankDetailMatches(p,p.bankImport.entries[1]),[]);
 assert.deepEqual(p,before);assert.equal(monthlyMetricSnapshot(p,'reported-spending','2026-04').valueCents,50000);
});

test('Explicit bank-detail links preserve totals and identities, are one-to-one and reversible',async()=>{
 const {setBankDetailLink,bankDetailLinkState}=await import('../src/budget.js');
 const p=plan();p.details=[{id:'same',name:'תשלום ישיר',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'}];
 const before=clone(p),snapshot=monthlyMetricSnapshot(p,'reported-spending','2026-04').valueCents;
 const next=setBankDetailLink(p,'a'.repeat(64),'same');
 assert.deepEqual(p,before);assert.equal(validatePlan(next),true);assert.equal(bankDetailLinkState(next,'a'.repeat(64)).status,'confirmed');
 assert.equal(monthlyMetricSnapshot(next,'reported-spending','2026-04').valueCents,snapshot);
 assert.deepEqual(next.bankImport,p.bankImport);assert.deepEqual(next.details,p.details);
 const second=clone(next);second.bankImport.entries.push({...second.bankImport.entries[0],key:'d'.repeat(64)});
 assert.throws(()=>setBankDetailLink(second,'d'.repeat(64),'same'),/כבר מקושר/);
 assert.equal(bankDetailLinkState(setBankDetailLink(next,'a'.repeat(64),''),'a'.repeat(64)).status,'none');
 for(const change of [q=>q.details[0].amount=201,q=>q.details[0].status='pending',q=>q.details=[],q=>q.bankImport.entries[0].cents=-20100,q=>q.bankImport.entries[0].field='exclude']){
  const edited=clone(next);change(edited);assert.equal(validatePlan(edited),true);assert.equal(bankDetailLinkState(edited,'a'.repeat(64)).status,'stale');
 }
});

test('Approval rejects settlement, unmatched amounts, wrong accounts/months, refunds and additional cheques',async()=>{
 const {setBankDetailLink}=await import('../src/budget.js');const p=plan();
 p.details=[{id:'same',name:'תשלום ישיר',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'}];
 assert.throws(()=>setBankDetailLink(p,'b'.repeat(64),'same'));
 for(const patch of [{amount:199},{amount:-200},{cashAccountId:'other'},{month:'2026-03'},{accounting:'additional'},{method:'card1'},{date:'2026-04-01'}]){
  const changed=clone(p);Object.assign(changed.details[0],patch);assert.throws(()=>setBankDetailLink(changed,'a'.repeat(64),'same'));
 }
 const duplicate=setBankDetailLink(p,'a'.repeat(64),'same');duplicate.bankDetailLinks.push({...duplicate.bankDetailLinks[0]});assert.equal(validatePlan(duplicate),false);
});

test('Bank matching UI requires confirmation, escapes merchant labels and exposes stale-link cleanup',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs'),model=await import('../src/budget.js');
 const p=plan();p.details=[{id:'same',name:'<script>bad</script>',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'}];
 let click,confirm,mutations=0;
 const c=vm.createContext({...model,plan:p,demoPreview:false,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),currency:String,app:{addEventListener(type,fn){click=fn;}},confirmAction:(title,text,fn)=>confirm=fn,mutate:next=>{c.plan=next;mutations++;},notify:()=>assert.fail('unexpected error')});
 const source=readFileSync('src/reports.js','utf8');vm.runInContext(source.slice(source.indexOf('function staleBankDetailLinksView('),source.indexOf('function dataCoverageView(')),c);
 const html=vm.runInContext('bankDetailLinkControls(plan.bankImport.entries[0],possibleBankDetailMatches(plan,plan.bankImport.entries[0]))',c);
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 click({target:{closest:()=>({dataset:{bankLinkKey:'a'.repeat(64),bankLinkDetail:'same'}})}});assert.equal(mutations,0);assert.equal(typeof confirm,'function');
 confirm();assert.equal(mutations,1);assert.equal(model.bankDetailLinkState(c.plan,'a'.repeat(64)).status,'confirmed');
 const orphan=model.clone(c.plan);orphan.bankImport.entries=[];c.plan=orphan;
 assert.match(vm.runInContext('staleBankDetailLinksView()',c),/data-bank-link-clear/);
 click({target:{closest:()=>({dataset:{bankLinkClear:'a'.repeat(64)}})}});assert.equal(c.plan.bankDetailLinks.length,0);
});

test('Explicit evidence links survive encrypted backup roundtrip without exposing them to the server projection',async()=>{
 const {setBankDetailLink,bankDetailLinkState}=await import('../src/budget.js'),{createVault,unlockVault}=await import('../src/vault.js');
 const p=plan();p.details=[{id:'same',name:'תשלום ישיר',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'}];
 const linked=setBankDetailLink(p,'a'.repeat(64),'same'),{envelope,recoveryKey}=await createVault(linked,'synthetic long test password','personal:test');
 assert.ok(!JSON.stringify(envelope).includes('bankDetailLinks'));
 const unlocked=await unlockVault(JSON.parse(JSON.stringify(envelope)),recoveryKey,true);
 assert.equal(validatePlan(unlocked.plan),true);assert.equal(bankDetailLinkState(unlocked.plan,'a'.repeat(64)).status,'confirmed');
 assert.deepEqual(unlocked.plan.bankDetailLinks,linked.bankDetailLinks);
});

test('Explicitly rejected matches stay dismissed until source evidence changes and are reversible',async()=>{
 const {rejectBankDetailMatch,resetBankDetailRejections}=await import('../src/budget.js');const p=plan();p.details=[{id:'same',name:'תשלום',category:'מזון',method:'variable',amount:200,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'}];
 const next=rejectBankDetailMatch(p,'a'.repeat(64),'same');assert.equal(validatePlan(next),true);assert.deepEqual(possibleBankDetailMatches(next,next.bankImport.entries[0]),[]);
 assert.equal(possibleBankDetailMatches(resetBankDetailRejections(next),next.bankImport.entries[0]).length,1);
 next.details[0].date='2026-04-11';assert.equal(possibleBankDetailMatches(next,next.bankImport.entries[0]).length,1);
});
