import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {zero,clone,validatePlan,addImportMigrationGuards,retainImportMigrationGuards,preserveImportMigrationGuards,forecast} from '../src/budget.js';
import {bankIdentity,bankPreview,applyBankImport} from '../src/bank-import-model.js';
import {applyReportInbox,inboxHash} from '../src/report-inbox-model.js';
import {createVault,unlockVault} from '../src/vault.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
const raw={line:1,date:'2026-02-10',amountCents:12345,description:'מקור לבדיקה',beneficiary:'מוטב',details:'פרטים',purpose:'',reference:'source-1',currency:'ILS',valid:true,balanceCents:null};
const opts={id:'report',accountId:'a',label:'חשבון',fileName:'test.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{'2026-02':'full'},choices:{1:{field:'salary',reviewed:true}}};
async function fixture(){const row=await bankIdentity(raw,'a');return {row,plan:addImportMigrationGuards(base(),[row],[hash('file')])};}
test('Minimal nonfinancial movement/file guards are validated, deduplicated and appended without mutation or cash-flow change',async()=>{
 const {row,plan}=await fixture(),p=base(),before=JSON.stringify(p),r=addImportMigrationGuards(p,[row,row],[hash('file'),hash('file')]);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(r));assert.deepEqual(forecast(r),forecast(p));assert.deepEqual(r.importMigrationGuards,{version:1,movements:[{key:row.key,fingerprint:row.fingerprint}],receipts:[hash('file')]});assert.doesNotMatch(JSON.stringify(r.importMigrationGuards),/amount|description|target|account|scope|house/);
 assert.ok(retainImportMigrationGuards(plan,r));assert.throws(()=>addImportMigrationGuards(plan,[{...row,fingerprint:hash('changed')}],[]),/זהות/);
 for(const change of [g=>g.movements.push(clone(g.movements[0])),g=>g.movements[0].amount=123,g=>g.movements[0].key='bad',g=>g.receipts.push(g.receipts[0]),g=>g.receipts=['bad'],g=>g.target='private-budget',g=>g.version=2,g=>g.movements=Array(10001).fill(g.movements[0])]){const p=clone(plan);change(p.importMigrationGuards);assert.equal(validatePlan(p),false);}
 const q=clone(plan);delete q.importMigrationGuards;assert.equal(retainImportMigrationGuards(plan,q),false);assert.deepEqual(preserveImportMigrationGuards(plan,q),plan);
});
test('Both key and fingerprint block reimport, including a new account or review override; fresh sources and skipped months retain ordinary behavior',async()=>{
 const {row,plan}=await fixture(),newAccount=await bankIdentity(raw,'new-account');assert.notEqual(newAccount.key,row.key);assert.equal(newAccount.fingerprint,row.fingerprint);
 for(const candidate of [row,newAccount,{...row,fingerprint:hash('changed')},{...row,key:hash('manual-key'),missingReference:false}]){
 const options={...opts,accountId:'new-account',choices:{1:{field:'exclude',reviewed:true}}},preview=bankPreview(plan,[candidate],options);assert.equal(preview.rows[0].state,'migrated');assert.equal(preview.rows[0].reviewed,false);assert.equal(preview.months[0].newCount,0);assert.equal(preview.months[0].pending,1);assert.throws(()=>applyBankImport(plan,[candidate],options));
 }
 const clean=await bankIdentity({...raw,reference:'source-2',description:'שונה'},'a'),preview=bankPreview(plan,[clean],opts);assert.equal(preview.rows[0].state,'new');assert.equal(preview.rows[0].reviewed,true);const next=applyBankImport(plan,[clean],opts);assert.deepEqual(next.importMigrationGuards,plan.importMigrationGuards);assert.equal(next.months['2026-02'].values.salary,123.45);
 const later=await bankIdentity({...raw,line:2,date:'2026-03-10',reference:'later',description:'חדש'},'a');const next2=applyBankImport(plan,[row,later],{...opts,to:'2026-03-31',modes:{'2026-02':'skip','2026-03':'full'},choices:{...opts.choices,2:{field:'salary',reviewed:true}}});assert.equal(next2.bankImport.entries.length,1);assert.equal(next2.bankImport.entries[0].key,later.key);
});
test('Known file hashes are blocked before parsing in the inbox and independently by the model',async()=>{
 const bytes=new TextEncoder().encode('synthetic known file'),fileHash=await inboxHash(bytes),p=addImportMigrationGuards(base(),[],[fileHash]);const before=JSON.stringify(p);
 const c=vm.createContext({plan:p,inboxHash,window:{addEventListener(){}},app:{addEventListener(){}},Uint8Array,TextEncoder,crypto});vm.runInContext(readFileSync('src/report-inbox-client.js','utf8'),c);const result=await c.inboxReadFile({size:bytes.length,name:'test.csv',arrayBuffer:async()=>bytes.buffer});assert.equal(result.skip,true);assert.match(result.reason,/מעבר חשבון/);
 await assert.rejects(()=>applyReportInbox(p,[],[],[{hash:fileHash,kind:'bank',target:'new',reference:'new'}],[],'2026-10'),/מעבר חשבון/);assert.equal(JSON.stringify(p),before);
});
test('Reset/replacement preserves same-space markers and markers survive encrypted save/unlock without an external financial index',async()=>{
 const {plan}=await fixture(),replacement=base();replacement.opening=42;const merged=preserveImportMigrationGuards(plan,replacement);assert.deepEqual(merged.importMigrationGuards,plan.importMigrationGuards);assert.equal(merged.opening,42);assert.equal(replacement.importMigrationGuards,undefined);
 const vault=await createVault(merged,'synthetic marker password','personal:tal'),opened=await unlockVault(vault.envelope,'synthetic marker password');assert.deepEqual(opened.plan.importMigrationGuards,plan.importMigrationGuards);assert.doesNotMatch(JSON.stringify(vault.envelope),new RegExp(plan.importMigrationGuards.movements[0].key));opened.rawKey.fill(0);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Personal and shared saves retain source markers under revision/access rules and reject removal without touching budgets or projections',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://guards.test';try{
 for(const user of ['tal','viewer']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(user),user,Date.now()+60000);}
 const app=createApp({db,DB,origin,allowedEmails:['tal','viewer'].map(u=>u+'@example.test'),reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const {plan}=await fixture();await req('tal','/api/plan','PUT',{plan,revision:0});const id=(await(await req('tal','/api/budgets','POST',{name:'בית'})).json()).id;await req('tal','/api/plan?budget='+id,'PUT',{plan,revision:0});
 for(const path of ['/api/plan','/api/plan?budget='+id]){const before=(await(await req('tal',path)).json());for(const changed of [base(),{...clone(plan),importMigrationGuards:{version:1,movements:[],receipts:[]}}])assert.equal((await req('tal',path,'PUT',{plan:changed,revision:1})).status,409);assert.deepEqual(await(await req('tal',path)).json(),before);const retained=clone(plan);retained.buffer=10;assert.equal((await req('tal',path,'PUT',{plan:retained,revision:1})).status,200);assert.equal((await req('tal',path,'PUT',{plan:retained,revision:1})).status,409);}
 const invite=await(await req('tal','/api/budgets/'+id+'/invites','POST',{email:'viewer@example.test',role:'viewer'})).json();await req('viewer','/api/budgets/accept','POST',{token:invite.token});assert.equal((await req('viewer','/api/plan?budget='+id,'PUT',{plan,revision:2})).status,403);assert.equal((await(await req('viewer','/api/plan')).json()).plan,null);
 }finally{db.close();}
});
