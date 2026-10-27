import {inflateRawSync} from 'node:zlib';
import {randomBytes,createCipheriv,createDecipheriv,createHash,publicEncrypt,privateDecrypt,constants,createPublicKey} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';import {dirname} from 'node:path';
export const reportHash=value=>createHash('sha256').update(value).digest('hex');
export function sealReport(key,bytes,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));return Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);}
export function openReport(key,value,aad){const b=Buffer.from(value);if(b.length<28)throw Error('Invalid report envelope');const cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(b.subarray(-16));return Buffer.concat([cipher.update(b.subarray(12,-16)),cipher.final()]);}
export function reportKey(db,{keyFile,publicKeyFile,key:providedKey,recoveryPublicKey}={}){
 db.exec('CREATE TABLE IF NOT EXISTS report_store_keys(id INTEGER PRIMARY KEY CHECK(id=1),fingerprint TEXT NOT NULL,wrapped BLOB NOT NULL,recipient_fingerprint TEXT)');if(!db.prepare('PRAGMA table_info(report_store_keys)').all().some(c=>c.name==='recipient_fingerprint'))db.exec('ALTER TABLE report_store_keys ADD COLUMN recipient_fingerprint TEXT');
 let key=providedKey;if(!key){if(keyFile&&existsSync(keyFile))key=readFileSync(keyFile);else if(keyFile){if(db.prepare('SELECT 1 FROM report_store_keys').get())throw Error('Report key missing; restore it before intake');mkdirSync(dirname(keyFile),{recursive:true,mode:0o700});key=randomBytes(32);try{writeFileSync(keyFile,key,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;key=readFileSync(keyFile);}}else key=randomBytes(32);}
 if(key.length!==32)throw Error('Invalid report key');
 const old=db.prepare('SELECT fingerprint,recipient_fingerprint FROM report_store_keys WHERE id=1').get();if(old&&old.fingerprint!==reportHash(key))throw Error('Report key mismatch');
 const pem=recoveryPublicKey??(publicKeyFile?readFileSync(publicKeyFile):null);if(!pem)throw Error('A recovery recipient is required for report intake');const pub=createPublicKey(pem);if(pub.asymmetricKeyType!=='rsa'||pub.asymmetricKeyDetails.modulusLength<3072)throw Error('Recovery recipient is too small');const recipient=reportHash(pub.export({type:'spki',format:'der'}));if(!old||old.recipient_fingerprint!==recipient){const wrapped=publicEncrypt({key:pub,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key);db.prepare('INSERT INTO report_store_keys(id,fingerprint,wrapped,recipient_fingerprint) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET wrapped=excluded.wrapped,recipient_fingerprint=excluded.recipient_fingerprint').run(reportHash(key),wrapped,recipient);}
 return key;
}
export function recoverReportKey(db,privateKey){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_store_keys'").get())return null;
 const row=db.prepare('SELECT * FROM report_store_keys WHERE id=1').get();if(!row)return null;const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},row.wrapped);if(key.length!==32||reportHash(key)!==row.fingerprint)throw Error('Recovered report key mismatch');return key;
}
export function verifyStoredReports(db,key){
 if(!key)return 0;let n=0;for(const row of db.prepare('SELECT id,scope,source_hash,source,metadata,draft FROM report_sources').iterate()){const aad=row.scope+'|'+row.id;if(reportHash(openReport(key,row.source,aad+'|source'))!==row.source_hash)throw Error('Stored report checksum mismatch');JSON.parse(openReport(key,row.metadata,aad+'|metadata'));if(row.draft)JSON.parse(openReport(key,row.draft,aad+'|draft'));n++;}
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='plan_history'").get())for(const row of db.prepare('SELECT id,scope,data FROM plan_history WHERE data IS NOT NULL').iterate())JSON.parse(inflateRawSync(openReport(key,row.data,'history|'+row.scope+'|'+row.id),{maxOutputLength:20000000}));
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='private_transfer_matches'").get())for(const row of db.prepare('SELECT user_id,id,data FROM private_transfer_matches').iterate())JSON.parse(openReport(key,row.data,'transfer-match|'+row.user_id+'|'+row.id));
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='private_space_migrations'").get())for(const row of db.prepare('SELECT user_id,id,data FROM private_space_migrations').iterate())JSON.parse(openReport(key,row.data,'space-migration|'+row.user_id+'|'+row.id));
 const has=table=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 for(const table of ['gmail_connections','gmail_pending','bank_mail_notices']){if(!has(table))continue;for(const row of db.prepare('SELECT * FROM '+table).iterate()){const binding='gmail|'+row.user_id+'|'+row.budget+(table==='gmail_pending'?'|pending':table==='bank_mail_notices'?'|notice|'+row.message_id:'');JSON.parse(openReport(key,row.data,binding));}}return n;
}
