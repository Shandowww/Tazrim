import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.mjs';
import {createDemoPlan} from '../src/budget.js';
import {encryptedDatabaseBackup} from '../server/backup-crypto.mjs';
import {recoveryDrill} from '../server/recovery-drill.mjs';

test('Downloaded archive drill preserves sources, verifies current migration and emits only private content-free receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'budgit-drill-test-'));
 try{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const pub=join(dir,'public.pem'),priv=join(dir,'private.pem'),source=join(dir,'source.sqlite'),reportFile=join(dir,'receipt.json');
  await writeFile(pub,publicKey);await writeFile(priv,privateKey,{mode:0o600});
  const {db,DB}=openDatabase(source),plan=createDemoPlan('2026-10');plan.demo=false;
  await DB.prepare('INSERT INTO plans VALUES(?,?,?,?)').bind('private-test-owner',JSON.stringify(plan),9,'2026-10-18').run();
  await DB.prepare('INSERT INTO budgets(id,owner_id,name,data,revision,updated_at) VALUES(?,?,?,?,?,?)').bind('11111111-1111-4111-8111-111111111111','private-test-owner','Private restored shared budget',JSON.stringify(plan),4,'2026-10-18').run();db.close();
  const archive=await encryptedDatabaseBackup({source,publicKeyFile:pub,directory:dir});
  const before=await readFile(source),report=await recoveryDrill({backup:archive.file,privateKeyFile:priv,reportFile});
  assert.equal(report.checks.budgetAndRevisionPreservation,true);assert.equal(report.checks.sharedMembershipRevocation,true);assert.equal(report.checks.restoredBudgetsDeniedToOutsiders,true);assert.equal(report.checks.revisionConflict,true);assert.equal(report.temporaryDatabaseRemoved,true);
  assert.deepEqual(await readFile(source),before);assert.equal((await stat(reportFile)).mode&0o777,0o600);
  assert.ok(!(await readFile(reportFile,'utf8')).includes('private-test-owner'));
  await assert.rejects(recoveryDrill({backup:archive.file,privateKeyFile:priv,reportFile}));
  const box=JSON.parse(await readFile(archive.file,'utf8'));box.tag=Buffer.alloc(16).toString('base64');await writeFile(archive.file,JSON.stringify(box));
  const failureReport=join(dir,'failure.json');await assert.rejects(recoveryDrill({backup:archive.file,privateKeyFile:priv,reportFile:failureReport}));
  await assert.rejects(stat(failureReport),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('An intact SQLite archive with incompatible application data cannot pass the recovery drill',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'budgit-incompatible-drill-'));
 try{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const source=join(dir,'unrelated.sqlite'),pub=join(dir,'public.pem'),priv=join(dir,'private.pem'),reportFile=join(dir,'receipt.json');
  await writeFile(pub,publicKey);await writeFile(priv,privateKey,{mode:0o600});
  const db=new DatabaseSync(source);db.exec('CREATE TABLE unrelated(id TEXT)');db.close();
  const archive=await encryptedDatabaseBackup({source,publicKeyFile:pub,directory:dir});
  await assert.rejects(recoveryDrill({backup:archive.file,privateKeyFile:priv,reportFile}),/compatibility verification failed/);
  await assert.rejects(stat(reportFile),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
