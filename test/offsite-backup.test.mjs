import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {encryptBackup,decryptBackup,encryptedDatabaseBackup,restoreBackupToNewFile} from '../server/backup-crypto.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Offsite archive is authenticated, encrypted and rejects wrong keys and tampering',()=>{
 const bytes=Buffer.from('sensitive test data'),encrypted=encryptBackup(bytes,publicKey);assert.ok(!encrypted.includes(bytes));assert.deepEqual(decryptBackup(encrypted,privateKey),bytes);
 for(const part of ['data','tag']){const box=JSON.parse(encrypted);const b=Buffer.from(box[part],'base64');b[0]^=1;box[part]=b.toString('base64');assert.throws(()=>decryptBackup(Buffer.from(JSON.stringify(box)),privateKey));}
 const box=JSON.parse(encrypted);box.header.createdAt='changed';assert.throws(()=>decryptBackup(Buffer.from(JSON.stringify(box)),privateKey));const other=generateKeyPairSync('rsa',{modulusLength:3072});assert.throws(()=>decryptBackup(encrypted,other.privateKey));
});
test('Consistent full DB snapshot restores on an external disk and never overwrites existing files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'budgit-backup-test-'));try{const source=join(dir,'live.sqlite'),pub=join(dir,'public.pem'),priv=join(dir,'private.pem'),output=join(dir,'restored.sqlite');await writeFile(pub,publicKey,{mode:0o600});await writeFile(priv,privateKey,{mode:0o600});const db=new DatabaseSync(source);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE test(id TEXT PRIMARY KEY,value TEXT);INSERT INTO test VALUES('id','private sample');");
 const receipt=await encryptedDatabaseBackup({source,publicKeyFile:pub,directory:join(dir,'archives'),release:'test'});db.exec("UPDATE test SET value='new value';");db.close();assert.equal((await stat(receipt.file)).mode&0o777,0o600);assert.ok(!(await readFile(receipt.file)).includes(Buffer.from('private sample')));
 await restoreBackupToNewFile({backup:receipt.file,privateKeyFile:priv,output});const restored=new DatabaseSync(output,{readOnly:true});assert.equal(restored.prepare('SELECT value FROM test').get().value,'private sample');restored.close();await assert.rejects(restoreBackupToNewFile({backup:receipt.file,privateKeyFile:priv,output}));assert.equal((await stat(output)).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
