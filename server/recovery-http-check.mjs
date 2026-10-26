// Start the actual HTTP server on a disposable restored copy, never on the source.
// Run inside a network-none container for live snapshots. No provider calls are proven.
import {DatabaseSync} from 'node:sqlite';import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {openDatabase} from './database.mjs';
export async function checkRecoveredHTTP(source,{keyFile,publicKeyFile}={}){
 const directory=mkdtempSync(join(tmpdir(),'budgit-http-recovery-')),copy=join(directory,'test.sqlite');let child;
 try{
  const sourceDB=new DatabaseSync(source,{readOnly:true});try{sourceDB.prepare('VACUUM INTO ?').run(copy);}finally{sourceDB.close();}
  const {db}=openDatabase(copy),id=randomUUID(),email=id+'@recovery.invalid',token=randomBytes(32).toString('hex');try{db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,email,Date.now());db.prepare('INSERT INTO auth_access VALUES(?,?)').run(email,Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+120000);}finally{db.close();}
  child=spawn(process.execPath,['server/start.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DB_PATH:copy,BUDGIT_RECOVERY_CHECK:'1',RECOVERY_REPORT_KEY_FILE:keyFile??'',RECOVERY_PUBLIC_KEY_FILE:publicKeyFile??'',PORT:'0',APP_ORIGIN:'https://recovery.invalid',GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',ADMIN_GOOGLE_EMAILS:'',ALLOWED_GOOGLE_EMAILS:''},stdio:['ignore','ignore','ignore','ipc']});
  const port=await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(Error('start timeout')),15000);child.once('error',rej);child.once('exit',()=>{clearTimeout(timer);rej(Error('early exit'));});child.on('message',value=>{if(value?.ready&&Number.isInteger(value.port)){clearTimeout(timer);res(value.port);}});});
  const request=(path,cookie)=>fetch('http://127.0.0.1:'+port+path,{headers:{origin:'https://recovery.invalid',...(cookie?{cookie:'__Host-mf_session='+cookie}:{})},signal:AbortSignal.timeout(5000)});
  const check=(ok)=>{if(!ok)throw Error('HTTP recovery failed');};
  check((await(await request('/api/health')).json()).ok===true);
  for(const path of ['/api/plan','/api/actions','/api/reports','/api/plan-history','/api/gmail','/api/data/transactions'])check((await request(path)).status===401);
  const own=await request('/api/plan',token);check(own.status===200);check((await own.json()).plan===null);
  for(const path of ['/api/reports','/api/plan-history','/api/actions'])check((await request(path,token)).status===200);
  return{freshRuntimeHTTPStartup:true,httpHealth:true,httpAnonymousPrivateRoutesDenied:true,httpSyntheticSessionIsolation:true,temporaryDatabaseRemoved:true};
 }finally{
  if(child?.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');},12000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  rmSync(directory,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await checkRecoveredHTTP(process.argv[2],{keyFile:process.argv[3],publicKeyFile:process.argv[4]})));}catch{console.error('Restored HTTP runtime check failed; no private diagnostics emitted.');process.exitCode=1;}}
