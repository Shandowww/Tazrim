import {snapshotStoredRecords,assertStoredRecords} from './preflight-preservation.mjs';
// Run against a consistent backup, never the live database. Prints no budget contents.
import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openDatabase} from './database.mjs';import {createDriveBackup} from './drive-backup.mjs';import {financialProjection} from './financial-data.mjs';import {isVault} from '../dist/server/vault.js';
const source=process.argv[2];if(!source)throw Error('Supply a consistent SQLite backup path');
const directory=mkdtempSync(join(tmpdir(),'budgit-migration-')),copy=join(directory,'test.sqlite');
const digest=db=>{const hash=createHash('sha256');for(const table of ['plans','budgets'])for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())hash.update(JSON.stringify(row));return hash.digest('hex');};
try{
 const original=new DatabaseSync(source,{readOnly:true});let before,preserved;try{before=digest(original);preserved=snapshotStoredRecords(original);original.prepare('VACUUM INTO ?').run(copy);}finally{original.close();}
 let {db}=openDatabase(copy);try{
  const backups=createDriveBackup({db,origin:'https://preflight.invalid',admins:new Set()});backups.trackTables();
  if(digest(db)!==before)throw Error('Migration changed an authoritative record');assertStoredRecords(db,preserved);
  for(const [table,prefix,key]of [['plans','personal:','user_id'],['budgets','budget:','id']])for(const row of db.prepare(`SELECT * FROM ${table}`).all()){
   const p=row.data?JSON.parse(row.data):null,scope=prefix+row[key],state=db.prepare('SELECT * FROM financial_scopes WHERE scope=?').get(scope);
   if(state?.revision!==row.revision)throw Error('Projection revision mismatch');
   const expected=p&&!isVault(p)&&p.startMonth?financialProjection(p):{transactions:[]};const rows=db.prepare('SELECT id,amount_cents,accounting FROM financial_transactions WHERE scope=? ORDER BY id').all(scope),wanted=expected.transactions.map(e=>({id:e.id,amount_cents:e.amount_cents,accounting:e.accounting})).sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
   if(JSON.stringify(rows)!==JSON.stringify(wanted))throw Error('Projected amounts, identities or accounting layers mismatch');
  }
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Migrated database integrity failed');
 }finally{db.close();}
 ({db}=openDatabase(copy));try{if(digest(db)!==before)throw Error('Repeated startup changed original records');assertStoredRecords(db,preserved);}finally{db.close();}
 console.log('PASS: migration preserves all original budgets, revisions, transaction identities, signed cents and accounting layers; all pre-existing authoritative table columns, integrity and repeat-startup checks passed.');
}finally{rmSync(directory,{recursive:true,force:true});}
