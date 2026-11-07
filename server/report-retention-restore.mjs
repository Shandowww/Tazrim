import {openReport,reportHash} from './report-crypto.mjs';
// Merge only from an explicitly supplied trusted current database, never from an
// unauthenticated client receipt. An older archive cannot know future removals.
export function mergeReportRetentionTombstones(restored,trusted,key){
 const has=(db,table)=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 if(!has(trusted,'report_lifecycle'))return 0;
 const expected=reportHash(key),fingerprint=db=>db.prepare('SELECT fingerprint FROM report_store_keys WHERE id=1').get()?.fingerprint;
 if(fingerprint(restored)!==expected||fingerprint(trusted)!==expected)throw Error('Retention recovery key mismatch');
 const removed=trusted.prepare('SELECT * FROM report_sources WHERE original_removed_at IS NOT NULL').all();
 for(const row of removed){const life=trusted.prepare('SELECT * FROM report_lifecycle WHERE source_id=?').get(row.id);if(!life||life.scope!==row.scope||life.source_hash!==row.source_hash||life.removed_at!==row.original_removed_at||row.source_bytes!==0||row.draft||openReport(key,row.source,row.scope+'|'+row.id+'|source').length)throw Error('Unverified retention tombstone');const data=JSON.parse(openReport(key,life.data,'report-lifecycle|'+row.scope+'|'+row.id));if(!data.completion?.verified)throw Error('Missing completion evidence');JSON.parse(openReport(key,row.metadata,row.scope+'|'+row.id+'|metadata'));}
 restored.exec('BEGIN IMMEDIATE');try{
  if(!restored.prepare('PRAGMA table_info(report_sources)').all().some(c=>c.name==='original_removed_at'))restored.exec('ALTER TABLE report_sources ADD COLUMN original_removed_at INTEGER');
  if(!has(restored,'report_lifecycle'))restored.exec(trusted.prepare("SELECT sql FROM sqlite_master WHERE name='report_lifecycle'").get().sql);
  const columns=new Set(restored.prepare('PRAGMA table_info(report_lifecycle)').all().map(c=>c.name));for(const name of ['needs_verification','retry_after'])if(!columns.has(name))restored.exec('ALTER TABLE report_lifecycle ADD COLUMN '+name+' INTEGER NOT NULL DEFAULT 0');
  for(const row of removed){
   const old=restored.prepare('SELECT * FROM report_sources WHERE id=? OR (scope=? AND source_hash=?)').get(row.id,row.scope,row.source_hash);
   if(old&&(old.id!==row.id||old.scope!==row.scope||old.source_hash!==row.source_hash))throw Error('Retention source identity collision');
   if(old?.original_removed_at!=null&&old.original_removed_at>=row.original_removed_at)continue;
   if(old)restored.prepare('UPDATE report_sources SET source=?,metadata=?,source_bytes=0,draft=NULL,original_removed_at=? WHERE id=?').run(row.source,row.metadata,row.original_removed_at,row.id);
   else{const names=['id','scope','source_hash','source','metadata','draft','source_bytes','revision','state','kind','target','month','created_at','original_removed_at'];restored.prepare('INSERT INTO report_sources('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').run(...names.map(n=>row[n]));}
   const life=trusted.prepare('SELECT * FROM report_lifecycle WHERE source_id=?').get(row.id),names=['source_id','scope','source_hash','revision','reviewed_at','completed_at','removed_at','data','needs_verification','retry_after'];
   restored.prepare('INSERT OR REPLACE INTO report_lifecycle('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').run(...names.map(n=>life[n]??(n==='needs_verification'||n==='retry_after'?0:null)));
   // Restore the minimal removed proposal, never its source-bearing predecessor.
   if(has(restored,'report_automation_jobs')&&has(trusted,'report_automation_jobs'))for(const job of trusted.prepare('SELECT * FROM report_automation_jobs WHERE intake_id=?').all(row.id)){JSON.parse(openReport(key,job.data,'automation|'+job.user_id+'|'+job.intake_id));restored.prepare('UPDATE report_automation_jobs SET data=?,revision=MAX(revision,?) WHERE user_id=? AND intake_id=?').run(job.data,job.revision,job.user_id,job.intake_id);}
  }
  restored.exec('COMMIT');return removed.length;
 }catch(error){restored.exec('ROLLBACK');throw error;}
}
