// Full-server recovery archive: encrypt on Hetzner with a public key only.
// The private recovery key must stay outside Hetzner and outside cloud backup folders.
import {createCipheriv,createDecipheriv,createHash,createPublicKey,createPrivateKey,publicEncrypt,privateDecrypt,randomBytes,constants} from 'node:crypto';
import {readFile,writeFile,mkdir,chmod,rm,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {recoverReportKey,verifyStoredReports} from './report-crypto.mjs';
const FORMAT='budgit-database-backup-v1';
// Password-manager copies can flatten PEM line wrapping. Reflow only a strict,
// complete unencrypted private-key envelope; never edit the source key file.
export function recoveryPrivateKey(text){
 try{return createPrivateKey(text);}catch(original){
  const match=String(text).match(/^\s*-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END \1-----\s*$/);if(!match)throw original;
  const body=match[2].replace(/\s/g,'');if(!body||body.length>20000)throw original;
  return createPrivateKey('-----BEGIN '+match[1]+'-----\n'+body.match(/.{1,64}/g).join('\n')+'\n-----END '+match[1]+'-----\n');
 }
}
export const keyFingerprint=key=>createHash('sha256').update(createPublicKey(key).export({type:'spki',format:'der'})).digest('hex');
export function encryptBackup(bytes,publicKey,metadata={}){
 const key=randomBytes(32),iv=randomBytes(12),header={format:FORMAT,algorithm:'RSA-OAEP-SHA256+AES-256-GCM',createdAt:new Date().toISOString(),keyFingerprint:keyFingerprint(publicKey),...metadata};
 const aad=Buffer.from(JSON.stringify(header)),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
 const result={header,wrappedKey:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};key.fill(0);return Buffer.from(JSON.stringify(result));
}
export function decryptBackup(bytes,privateKey){
 const box=JSON.parse(bytes.toString());if(box?.header?.format!==FORMAT||box.header.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM'||box.header.keyFingerprint!==keyFingerprint(privateKey))throw Error('Backup format or recovery key mismatch');
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(box.wrappedKey,'base64'));
 try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));decipher.setAAD(Buffer.from(JSON.stringify(box.header)));decipher.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(box.data,'base64')),decipher.final()]);}finally{key.fill(0);}
}
export function checkDatabase(file){const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database recovery integrity check failed');return true;}finally{db.close();}}
export async function encryptedDatabaseBackup({source,publicKeyFile,directory,release=''}){
 const publicKey=await readFile(publicKeyFile,'utf8');const recipient=createPublicKey(publicKey);if(recipient.asymmetricKeyType!=='rsa'||recipient.asymmetricKeyDetails.modulusLength<3072)throw Error('Use an RSA recovery key of at least 3072 bits');
 await mkdir(directory,{recursive:true,mode:0o700});const stamp=new Date().toISOString().replace(/[:.]/g,'-'),temporary=resolve(directory,'.snapshot-'+randomBytes(12).toString('hex')+'.sqlite'),output=resolve(directory,'budgit-'+stamp+'.backup');
 try{const db=new DatabaseSync(source,{readOnly:true});try{db.prepare('VACUUM INTO ?').run(temporary);}finally{db.close();}await chmod(temporary,0o600);checkDatabase(temporary);
 let reportCoverage=[];const snapshotDb=new DatabaseSync(temporary,{readOnly:true});try{if(snapshotDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_store_keys'").get()){const columns=snapshotDb.prepare('PRAGMA table_info(report_store_keys)').all(),row=snapshotDb.prepare('SELECT * FROM report_store_keys WHERE id=1').get();if(row&&(!columns.some(c=>c.name==='recipient_fingerprint')||row.recipient_fingerprint!==keyFingerprint(publicKey)))throw Error('Report recovery recipient mismatch; rewrap before backup');}if(snapshotDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_sources'").get())reportCoverage=snapshotDb.prepare('SELECT id,scope,source_hash AS sourceHash,revision FROM report_sources').all();}finally{snapshotDb.close();}
 const checksum=createHash('sha256');for await(const chunk of createReadStream(temporary))checksum.update(chunk);
 const key=randomBytes(32),iv=randomBytes(12),header={format:FORMAT,algorithm:'RSA-OAEP-SHA256+AES-256-GCM',createdAt:new Date().toISOString(),keyFingerprint:keyFingerprint(publicKey),release,sha256:checksum.digest('hex')},cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify(header)));
 const archiveHash=createHash('sha256');let handle;
 try{
  handle=await open(output,'wx',0o600);const put=async value=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);archiveHash.update(bytes);await handle.writeFile(bytes);};
  const wrappedKey=publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64');
  await put(JSON.stringify({header,wrappedKey,iv:iv.toString('base64')}).slice(0,-1)+',"data":"');
  let carry=Buffer.alloc(0);const encode=async chunk=>{const bytes=carry.length?Buffer.concat([carry,chunk]):chunk,end=bytes.length-bytes.length%3;if(end)await put(bytes.subarray(0,end).toString('base64'));carry=Buffer.from(bytes.subarray(end));};
  for await(const chunk of createReadStream(temporary))await encode(cipher.update(chunk));await encode(cipher.final());if(carry.length)await put(carry.toString('base64'));
  await put('","tag":'+JSON.stringify(cipher.getAuthTag().toString('base64'))+'}');await handle.close();handle=null;
  return{file:output,keyFingerprint:header.keyFingerprint,sha256:archiveHash.digest('hex'),reportCoverage};
 }catch(e){if(handle){await handle.close();await rm(output,{force:true});}throw e;}finally{key.fill(0);}
 }finally{await rm(temporary,{force:true});}
}
export async function restoreBackupToNewFile({backup,privateKeyFile,output,reportKeyOutput}){
 const bytes=await readFile(backup),key=recoveryPrivateKey(await readFile(privateKeyFile,'utf8')),plain=decryptBackup(bytes,key),header=JSON.parse(bytes.toString()).header;
 if(createHash('sha256').update(plain).digest('hex')!==header.sha256)throw Error('Backup checksum mismatch');
 await mkdir(dirname(output),{recursive:true,mode:0o700});await writeFile(output,plain,{mode:0o600,flag:'wx'});
 let reportSources=0;
 try{checkDatabase(output);const restored=new DatabaseSync(output,{readOnly:true});try{const reportKey=recoverReportKey(restored,key);if(reportKey){try{reportSources=verifyStoredReports(restored,reportKey);if(reportKeyOutput)await writeFile(reportKeyOutput,reportKey,{mode:0o600,flag:'wx'});}finally{reportKey.fill(0);}}else if(['report_sources','gmail_connections','bank_mail_notices','plan_history'].some(table=>restored.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)&&restored.prepare('SELECT 1 FROM '+table+(table==='plan_history'?' WHERE data IS NOT NULL':'')+' LIMIT 1').get()))throw Error('Report recovery key missing');}finally{restored.close();}}catch(error){await rm(output,{force:true});throw error;}
 return{file:output,release:header.release,createdAt:header.createdAt,reportSources};
}
