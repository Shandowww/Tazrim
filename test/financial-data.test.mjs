import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openDatabase} from '../server/database.mjs';import {financialProjection,queryFinancialTransactions} from '../server/financial-data.mjs';import {createDemoPlan,clone,validatePlan} from '../src/budget.js';import {createVault} from '../src/vault.js';
const sample=()=>{const p=createDemoPlan('2026-10');p.demo=false;p.bankImport={version:1,accounts:[{id:'bank',label:'בדיקה',rules:[]}],batches:[{id:'batch',file:'bank.csv',accountId:'bank',from:'2026-10-01',to:'2026-10-31',months:[]}],entries:[{key:'a'.repeat(64),fingerprint:'b'.repeat(64),month:'2026-10',field:'salary',cents:12345,batchId:'batch',accountId:'bank'}]};p.details=[{id:'detail',name:'חנות בדיקה',amount:25.15,category:'קניות / כללי',method:'card1',month:'2026-10',date:'2026-10-01',number:'',status:'cleared',accounting:'included'}];return p;};
const put=(DB,user,p,rev=0)=>DB.prepare(rev?'UPDATE plans SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?':'INSERT INTO plans(user_id,data,revision,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(...(rev?[JSON.stringify(p),'2026-10-16',user,rev]:[user,JSON.stringify(p),1,'2026-10-16'])).run();
test('Normalized projection preserves source snapshots, signs, identifiers and separate accounting layers',async()=>{
 const {db,DB}=openDatabase(':memory:'),p=sample(),before=JSON.stringify(p);assert.equal(validatePlan(p),true);await put(DB,'alice',p);
 assert.equal(db.prepare('SELECT data FROM plans').get().data,before);assert.equal(JSON.stringify(p),before);
 const query=queryFinancialTransactions(db,'personal:alice');assert.equal(query.total,2);assert.equal(query.rows.find(e=>e.id==='detail').amount_cents,-2515);assert.equal(query.rows.find(e=>e.source==='bank').amount_cents,12345);assert.equal(query.rows.find(e=>e.source==='bank').detail_level,'legacy-summary');assert.equal(query.rows.find(e=>e.source==='bank').occurred_on,null);
 assert.equal(query.rows.find(e=>e.source==='bank').accounting,'monthly-component');assert.equal(query.rows.find(e=>e.id==='detail').accounting,'included');assert.equal(queryFinancialTransactions(db,'personal:bob').total,0);
 assert.equal(queryFinancialTransactions(db,'personal:alice',{q:'חנות',card:'card1',month:'2026-10'}).total,1);assert.equal(queryFinancialTransactions(db,'personal:alice',{q:"%' OR 1=1 --"}).total,0);assert.equal(queryFinancialTransactions(db,'personal:alice',{q:'%'}).total,0);
 const audit=db.prepare('SELECT COUNT(*) AS n FROM financial_audit').get().n;await put(DB,'alice',p,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM financial_audit').get().n,audit);assert.equal(queryFinancialTransactions(db,'personal:alice').total,2);db.close();
});
test('Rejected revision and failed projection both roll back, leaving budget and query model consistent',async()=>{
 const {db,DB}=openDatabase(':memory:'),p=sample();await put(DB,'alice',p);const before=db.prepare('SELECT * FROM plans').get();
 const changed=clone(p);changed.details[0].amount=100;assert.equal((await put(DB,'alice',changed,7)).meta.changes,0);assert.equal(queryFinancialTransactions(db,'personal:alice').rows.find(e=>e.id==='detail').amount_cents,-2515);
 db.exec("CREATE TRIGGER reject_projection BEFORE INSERT ON financial_transactions BEGIN SELECT RAISE(ABORT,'test projection failure'); END;");await assert.rejects(put(DB,'alice',changed,1));assert.deepEqual(db.prepare('SELECT * FROM plans').get(),before);assert.equal(queryFinancialTransactions(db,'personal:alice').rows.find(e=>e.id==='detail').amount_cents,-2515);db.close();
});
test('Startup backfill is idempotent and never rewrites original records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'budgit-db-test-')),path=join(dir,'test.sqlite');try{let {db}=openDatabase(path);const data=JSON.stringify(sample());db.prepare('INSERT INTO plans VALUES(?,?,?,?)').run('alice',data,8,'2026-10-16');db.close();
 ({db}=openDatabase(path));assert.equal(queryFinancialTransactions(db,'personal:alice').total,2);const count=db.prepare('SELECT COUNT(*) AS n FROM financial_audit').get().n;assert.equal(db.prepare('SELECT data,revision FROM plans').get().data,data);db.close();({db}=openDatabase(path));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM financial_audit').get().n,count);assert.equal(db.prepare('SELECT revision FROM plans').get().revision,8);db.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('Encrypting a budget clears all plaintext projections and audit metadata; new encrypted budgets are never indexed',async()=>{
 const {db,DB}=openDatabase(':memory:'),p=sample();await put(DB,'alice',p);const {envelope}=await createVault(p,'a very long test password','personal:alice');await put(DB,'alice',envelope,1);
 for(const table of ['financial_entities','financial_transactions','financial_months','financial_audit'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE scope=?`).get('personal:alice').n,0);
 assert.equal(queryFinancialTransactions(db,'personal:alice').encrypted,true);assert.equal(db.prepare('SELECT data FROM plans').get().data,JSON.stringify(envelope));db.close();
});
test('Bank source metadata enriches search without changing existing transaction identity or amount',()=>{
 const p=sample(),before=financialProjection(p).transactions.find(e=>e.source==='bank');p.bankImport.entries[0].source={date:'2026-10-12',valueDate:null,description:'משכורת',details:'חברה',beneficiary:'מעסיק',purpose:'',reference:'',currency:'ILS',balanceCents:55555};assert.equal(validatePlan(p),true);
 const after=financialProjection(p).transactions.find(e=>e.source==='bank');assert.equal(after.id,before.id);assert.equal(after.amount_cents,before.amount_cents);assert.equal(after.occurred_on,'2026-10-12');assert.equal(after.description,'משכורת · חברה');assert.equal(after.detail_level,'source-fields');
});
test('Multi-year detail history exceeds the former 400 limit while remaining searchable and paginated',async()=>{
 const {db,DB}=openDatabase(':memory:'),p=sample(),template=p.details[0];p.details=Array.from({length:4500},(_,i)=>({...template,id:'detail-'+i,date:'2026-10-'+String(1+i%28).padStart(2,'0'),amount:(i+1)/100}));assert.equal(validatePlan(p),true);
 await put(DB,'alice',p);const first=queryFinancialTransactions(db,'personal:alice',{source:'manual-detail',limit:200}),second=queryFinancialTransactions(db,'personal:alice',{source:'manual-detail',limit:200,offset:200});assert.equal(first.total,4500);assert.equal(first.rows.length,200);assert.equal(new Set([...first.rows,...second.rows].map(e=>e.id)).size,400);assert.equal(db.prepare('SELECT SUM(amount_cents) AS n FROM financial_transactions WHERE source=?').get('manual-detail').n,-4500*4501/2);db.close();
});
test('Deleting a scope removes its derived data and audit only, preserving other users',async()=>{
 const {db,DB}=openDatabase(':memory:');await put(DB,'alice',sample());await put(DB,'bob',sample());await DB.prepare('DELETE FROM plans WHERE user_id=?').bind('alice').run();for(const table of ['financial_scopes','financial_entities','financial_transactions','financial_months','financial_audit'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE scope=?`).get('personal:alice').n,0);assert.equal(queryFinancialTransactions(db,'personal:bob').total,2);db.close();
});

test('Release preflight migrates only a copy and verifies the original budget byte for byte',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'budgit-preflight-test-')),file=join(directory,'backup.sqlite');try{const {db,DB}=openDatabase(file);await put(DB,'alice',sample());db.close();const result=spawnSync(process.execPath,['server/preflight-financial-data.mjs',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS: migration preserves/);const reopened=openDatabase(file);assert.equal(reopened.db.prepare('SELECT data FROM plans').get().data,JSON.stringify(sample()));reopened.db.close();}finally{rmSync(directory,{recursive:true,force:true});}
});

test('Incremental projection retains untouched rows and rolls changed rows through the same transaction',async()=>{
 const {db,DB}=openDatabase(':memory:');try{
  const p=sample();p.details.push({...p.details[0],id:'untouched',amount:50});await put(DB,'alice',p);
  db.exec("CREATE TABLE projection_writes(kind TEXT,id TEXT); CREATE TRIGGER probe_update AFTER UPDATE ON financial_transactions BEGIN INSERT INTO projection_writes VALUES('update',NEW.id); END; CREATE TRIGGER probe_delete AFTER DELETE ON financial_transactions BEGIN INSERT INTO projection_writes VALUES('delete',OLD.id); END; CREATE TRIGGER probe_insert AFTER INSERT ON financial_transactions BEGIN INSERT INTO projection_writes VALUES('insert',NEW.id); END;");
  const next=clone(p);next.details[0].amount=40;await put(DB,'alice',next,1);
  const writes=db.prepare('SELECT * FROM projection_writes').all();assert.ok(writes.length>0);assert.ok(writes.every(row=>row.id==='detail'));
  assert.equal(queryFinancialTransactions(db,'personal:alice').rows.find(row=>row.id==='untouched').amount_cents,-5000);
  db.exec('DELETE FROM projection_writes');await put(DB,'alice',next,2);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projection_writes').get().n,0);
 }finally{db.close();}
});

test('Search pagination can bind a revision and rejects a changed snapshot instead of silently mixing pages',async()=>{
 const {db,DB}=openDatabase(':memory:');try{
  const p=sample();await put(DB,'alice',p);const first=queryFinancialTransactions(db,'personal:alice',{limit:1});
  assert.equal(queryFinancialTransactions(db,'personal:alice',{limit:1,offset:1,revision:first.revision}).conflict,undefined);
  const next=clone(p);next.details[0].amount+=1;await put(DB,'alice',next,1);
  assert.deepEqual(queryFinancialTransactions(db,'personal:alice',{offset:1,revision:first.revision}),{conflict:true,revision:2});
 }finally{db.close();}
});

test('Release preflight refuses a copied startup that changes stored source bytes and leaves the supplied backup untouched',()=>{
 const directory=mkdtempSync(join(tmpdir(),'budgit-preservation-failure-')),file=join(directory,'backup.sqlite');try{
  const {db}=openDatabase(file),data=JSON.stringify(sample());db.prepare('INSERT INTO plans VALUES(?,?,?,?)').run('alice',data,3,'2026-10-30');db.exec("CREATE TABLE preserved_source(id TEXT PRIMARY KEY,data BLOB NOT NULL);INSERT INTO preserved_source VALUES('synthetic',x'00ff01');CREATE TRIGGER simulate_startup_data_loss AFTER INSERT ON financial_transactions BEGIN UPDATE preserved_source SET data=x'00ff02'; END;");db.close();
  const result=spawnSync(process.execPath,['server/preflight-financial-data.mjs',file],{encoding:'utf8',timeout:15000});assert.notEqual(result.status,0);assert.match(result.stderr,/Startup changed existing stored records: preserved_source/);assert.ok(!result.stderr.includes(data));
  const original=new DatabaseSync(file,{readOnly:true});try{assert.equal(original.prepare('SELECT hex(data) bytes FROM preserved_source').get().bytes,'00FF01');assert.equal(original.prepare('SELECT data FROM plans').get().data,data);assert.equal(original.prepare('SELECT COUNT(*) n FROM financial_transactions').get().n,0)}finally{original.close()}
 }finally{rmSync(directory,{recursive:true,force:true})}
});
