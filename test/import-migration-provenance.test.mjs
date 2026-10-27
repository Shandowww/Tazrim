import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {zero,clone,validatePlan} from '../src/budget.js';
import {bankIdentity,applyBankImport} from '../src/bank-import-model.js';
import {reviewAccountMigration} from '../src/space-migration-model.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
const base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const options={user:'tal',sourceId:'personal',targetId:'house',accountId:'a',sourceRevision:1,targetRevision:1};
async function fixture(count=2){
 const p=base();p.cashPlanning={accounts:[{id:'a',label:'נבחר',opening:0,buffer:0},{id:'b',label:'אחר',opening:0,buffer:0}],months:{},cardAccounts:{},transfers:[]};
 const records=await Promise.all(Array.from({length:count},(_,i)=>bankIdentity({line:i+1,date:'2026-02-'+String(i%27+1).padStart(2,'0'),valueDate:null,amountCents:i%2?-12345:45678,description:'תנועה '+i,beneficiary:'מוטב '+i,purpose:'מטרה '+i,details:'פרטים '+i,reference:'REF-'+i,currency:'ILS',valid:true,balanceCents:null},'a')));
 const plan=applyBankImport(p,records,{id:'batch-a',accountId:'a',label:'נבחר',fileName:'private filename.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{'2026-02':'full'},choices:Object.fromEntries(records.map(r=>[r.line,{field:r.amountCents<0?'variable':'salary',reviewed:true}])),rules:[]});
 plan.reportInbox={version:1,bindings:[{key:hash('private-binding'),kind:'bank',target:'a'}],receipts:[{hash:hash('file'),kind:'bank',target:'a',reference:'batch-a'}]};
 // Snapshot contents may include other accounts and must never enter the review.
 plan.bankImport.batches[0].months[0].before={values:zero(),actual:false,includesPlannedCard:false,privateNote:'SECRET-MIXED-SNAPSHOT'};
 plan.bankImport.batches[0].months[0].beforeCash={b:{privateNote:'SECRET-OTHER-ACCOUNT'}};
 assert.ok(validatePlan(plan));return plan;
}
const review=(p,q=base())=>reviewAccountMigration(p,q,options).imports;
test('Complete import inventory retains exact signed cents, stable scoped identities, source fields and receipts without any snapshot contents',async()=>{
 const p=await fixture(),q=base(),before=JSON.stringify([p,q]),r=review(p,q);assert.equal(JSON.stringify([p,q]),before);assert.equal(r.applyAvailable,false);assert.equal(r.movements.length,2);assert.equal(r.receipts.length,1);assert.equal(r.batches.length,1);
 for(let i=0;i<2;i++){const e=p.bankImport.entries[i],row=r.movements[i];assert.equal(row.key,e.key);assert.equal(row.fingerprint,e.fingerprint);assert.equal(row.amountCents,e.cents);assert.equal(row.state,'not-found');assert.equal(row.provenanceValid,true);assert.notEqual(row.sourceRef,row.proposedTargetRef);assert.equal(row.source.description,e.source.description);assert.equal(row.source.balanceCents,null);}
 assert.equal(r.receipts[0].sourcePresent,true);assert.equal(r.batches[0].movementCount,2);assert.equal(r.batches[0].receiptCount,1);assert.ok(r.blockers.some(b=>b.code==='import-atomic-pending'));assert.equal(r.retention.sourceReimportProtection,'required-before-apply');
 assert.doesNotMatch(JSON.stringify(r),/SECRET|private filename|private-binding|beforeCash|beforeGoals|afterGoals/);
});
test('Exact keys, classification/amount/source conflicts and fingerprints under different keys are distinguished without name-based merging',async()=>{
 const p=await fixture(),q=clone(p);assert.equal(review(p,q).movements[0].state,'same-source');
 for(const mutate of [e=>e.cents+=1,e=>e.field='otherIncome',e=>e.source.reference='different',e=>e.accountId='b',e=>e.fingerprint=hash('other')]){const q=clone(p);q.bankImport.accounts.push({id:'b',label:'אחר',rules:[]});mutate(q.bankImport.entries[0]);assert.ok(validatePlan(q));assert.equal(review(p,q).movements[0].state,'identity-conflict');}
 const repeated=clone(p);repeated.bankImport.entries[1].fingerprint=repeated.bankImport.entries[0].fingerprint;assert.ok(review(repeated).blockers.some(b=>b.code==='source-overlap'&&b.count===2));
 const overlap=clone(p);overlap.bankImport.entries[0].key=hash('different-key');let r=review(p,overlap);assert.equal(r.movements[0].state,'possible-overlap');assert.equal(r.movements[0].targetMatchCount,1);assert.ok(r.blockers.some(b=>b.code==='movement-overlap'));
 const separate=clone(p);separate.bankImport.entries=[];separate.bankImport.batches=[];separate.bankImport.accounts[0].label=p.cashPlanning.accounts[0].label;r=review(p,separate);assert.equal(r.movements[0].state,'not-found');assert.equal(r.movements[0].targetMatchCount,0);
});
test('Legacy sources, weak references, cross-account or out-of-range batches and unknown metadata remain explicit blockers',async()=>{
 for(const mutate of [p=>delete p.bankImport.entries[0].source,p=>p.bankImport.entries[0].source.date='2026-03-01',p=>p.bankImport.batches[0].from='2026-02-10',p=>p.bankImport.batches[0].months=[]]){const p=await fixture();mutate(p);assert.ok(validatePlan(p));const r=review(p);assert.equal(r.movements[0].provenanceValid,false);assert.ok(r.blockers.some(b=>b.code==='source-unverified'));}
 const p=await fixture();p.bankImport.entries[0].source.reference='';p.bankImport.entries[0].source.secretLink='unreviewed';let r=review(p);assert.ok(r.blockers.some(b=>b.code==='weak-reference'));assert.ok(r.blockers.some(b=>b.code==='unreviewed-metadata'));assert.doesNotMatch(JSON.stringify(r),/unreviewed"|secretLink/);
 p.bankImport.accounts.push({id:'b',label:'אחר',rules:[]});p.bankImport.batches[0].accountId='b';assert.ok(validatePlan(p));r=review(p);assert.equal(r.movements[0].provenanceValid,false);assert.equal(r.receipts[0].sourcePresent,false);assert.ok(r.blockers.some(b=>b.code==='receipt-unverified'));
});
test('Receipt hashes and report IDs are checked independently; missing receipts never imply full reimport coverage',async()=>{
 const p=await fixture(),q=clone(p);let r=review(p,q);assert.equal(r.receipts[0].state,'same-receipt');assert.equal(r.batches[0].targetIdPresent,true);
 q.reportInbox.receipts[0].target='b';r=review(p,q);assert.equal(r.receipts[0].state,'receipt-conflict');q.reportInbox.receipts[0].target='a';q.reportInbox.receipts[0].hash=hash('another-file');assert.equal(review(p,q).receipts[0].state,'possible-overlap');
 p.reportInbox.receipts=[];r=review(p);assert.equal(r.batches[0].receiptCount,0);assert.ok(r.blockers.some(b=>b.code==='unreceipted-batch'));
 p.reportInbox.receipts=[{hash:hash('stale-file'),kind:'bank',target:'a',reference:'absent'}];assert.equal(review(p).receipts[0].sourcePresent,false);
});
test('Other-account descriptions and sources stay outside the exact inventory; all selected items remain reachable beyond the old five-example limit',async()=>{
 const p=await fixture(31);p.bankImport.accounts.push({id:'b',label:'אחר',rules:[]});const other=clone(p.bankImport.entries[0]);other.key=hash('other-key');other.accountId='b';other.source.description='SECRET-OTHER-MOVEMENT';p.bankImport.entries.push(other);assert.ok(validatePlan(p));const r=review(p);assert.equal(r.movements.length,31);assert.doesNotMatch(JSON.stringify(r),/SECRET/);
 const c=vm.createContext({window:{addEventListener(){}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:n=>String(n)});vm.runInContext(readFileSync('src/space-migration-client.js','utf8'),c);
 r.movements[0].source.description='<script>bad</script>';r.movements[0].source.details='x'.repeat(2000);const first=c.migrationImportProvenanceView(r),last=c.migrationImportProvenanceView(r,{movements:1});assert.match(first,/&lt;script&gt;bad/);assert.doesNotMatch(first,/<script>/);assert.ok(first.includes('x'.repeat(2000)));assert.match(first,/1–25 מתוך 31/);assert.match(last,/26–31 מתוך 31/);assert.match(last,/תנועה 30/);assert.match(first,/מעבר החשבון המיובא עדיין חסום/);assert.doesNotMatch(first,/data-migration="apply"/);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Exact inventory is authorized read-only, revision-bound and no-store; imported apply remains blocked and nothing is persisted',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://import-migration.test';try{
 for(const user of ['tal','viewer','third']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(user),user,Date.now()+60000);}
 const app=createApp({db,DB,origin,allowedEmails:['tal','viewer','third'].map(u=>u+'@example.test'),reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const p=await fixture();await req('tal','/api/plan','PUT',{plan:p,revision:0});await req('viewer','/api/plan','PUT',{plan:p,revision:0});const id=(await(await req('tal','/api/budgets','POST',{name:'בית'})).json()).id;await req('tal','/api/plan?budget='+id,'PUT',{plan:base(),revision:0});const invite=await(await req('tal','/api/budgets/'+id+'/invites','POST',{email:'viewer@example.test',role:'viewer'})).json();await req('viewer','/api/budgets/accept','POST',{token:invite.token});
 const snapshot=()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'"').all()]),before=snapshot(),path='/api/space-migration-review?source=personal&target='+id+'&account=a&sourceRevision=1&targetRevision=1';
 const response=await req('tal',path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();assert.equal(data.review.imports.movements.length,2);assert.doesNotMatch(JSON.stringify(data),/SECRET-MIXED-SNAPSHOT|SECRET-OTHER-ACCOUNT|private filename/);assert.deepEqual(snapshot(),before);
 for(const u of ['viewer','third'])assert.ok([403,404].includes((await req(u,path)).status));assert.equal((await req('tal',path.replace('sourceRevision=1','sourceRevision=0'))).status,409);assert.equal((await req('tal',path,'POST',{})).status,405);
 const input={accountId:'tal',source:'personal',target:id,bankAccount:'a',sourceRevision:1,targetRevision:1},prepared=await(await req('tal','/api/space-migrations?'+new URLSearchParams(input))).json();assert.equal(prepared.eligible,false);assert.equal(prepared.reviewToken,undefined);assert.equal((await req('tal','/api/space-migrations','POST',{...input,action:'apply',operation:crypto.randomUUID(),reviewToken:'0'.repeat(64),confirmedMove:true,confirmedPrivacy:true})).status,409);assert.deepEqual(snapshot(),before);
 }finally{db.close();}
});
