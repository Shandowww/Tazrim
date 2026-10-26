// Run locally against a downloaded encrypted archive. Starts only a temporary loopback HTTP server; does not contact Drive.
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createPublicKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {restoreBackupToNewFile,recoveryPrivateKey} from './backup-crypto.mjs';

export async function recoveryDrill({backup,privateKeyFile,reportFile}){
 const started=Date.now(),directory=await mkdtemp(join(tmpdir(),'budgit-recovery-drill-'));
 try{
  const restored=await restoreBackupToNewFile({backup,privateKeyFile,output:join(directory,'recovered.sqlite'),reportKeyOutput:join(directory,'report-store.key')});
  const result=spawnSync(process.execPath,['server/preflight-financial-data.mjs',restored.file],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  // Child diagnostics can contain source values; never echo them into a report or console.
  if(result.error||result.status!==0)throw Error('Recovery compatibility verification failed; no successful drill was recorded.');
  const publicKeyFile=join(directory,'recovery-public.pem');await writeFile(publicKeyFile,createPublicKey(recoveryPrivateKey(await readFile(privateKeyFile,'utf8'))).export({type:'spki',format:'pem'}),{mode:0o600});
  const access=spawnSync(process.execPath,['server/recovery-access-check.mjs',restored.file,join(directory,'report-store.key'),publicKeyFile],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  if(access.error||access.status!==0)throw Error('Recovery application access verification failed; no successful drill was recorded.');
  const accessChecks=JSON.parse(access.stdout);
  const http=spawnSync(process.execPath,['server/recovery-http-check.mjs',restored.file,join(directory,'report-store.key'),publicKeyFile],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
  if(http.error||http.status!==0)throw Error('Recovery HTTP startup verification failed; no successful drill was recorded.');
  const httpChecks=JSON.parse(http.stdout);
  const checked=new DatabaseSync(restored.file,{readOnly:true});let sourceEvidence;try{const has=table=>checked.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);sourceEvidence={storedReportSourcesPresent:!!restored.reportSources,pendingReportDraftPresent:!!(has('report_sources')&&checked.prepare("SELECT 1 FROM report_sources WHERE draft IS NOT NULL AND state NOT IN ('committed','archived') LIMIT 1").get()),journalSnapshotsPresent:!!(has('plan_history')&&checked.prepare('SELECT 1 FROM plan_history WHERE data IS NOT NULL LIMIT 1').get())};}finally{checked.close();}
  const report={format:'budgit-recovery-drill-v1',completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,archiveSha256:createHash('sha256').update(await readFile(backup)).digest('hex'),checks:{authenticatedDecryption:true,pendingReportAndMailboxDecryption:true,snapshotChecksum:true,sqliteIntegrity:true,foreignKeys:true,currentVersionMigration:true,budgetAndRevisionPreservation:true,transactionIdentityAndSignedCents:true,repeatedStartup:true,...accessChecks,...httpChecks},sourceEvidence,limitations:['Does not verify Google Drive delivery or backup freshness.','Uses in-process and local HTTP requests with synthetic OAuth identities; does not verify real Google login, browser rendering, encrypted-budget unlocking or full host reconstruction.'],temporaryDatabaseRemoved:true};
  // Cleanup must succeed before declaring success or writing a receipt.
  await rm(directory,{recursive:true,force:true});
  if(reportFile)await writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  return report;
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [backup,privateKeyFile,reportFile]=process.argv.slice(2);
  if(!backup||!privateKeyFile||!reportFile)throw Error('Usage: node server/recovery-drill.mjs <downloaded.backup> <private-key.pem> <new-report.json>');
  console.log(JSON.stringify(await recoveryDrill({backup,privateKeyFile,reportFile})));
 }catch{console.error('Recovery drill failed. Check archive, recovery key, current build and a new report path. No successful drill was recorded.');process.exitCode=1;}
}
