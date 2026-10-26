// Exercise application requests in-process on a disposable copy; no listening socket or real OAuth.
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openDatabase} from './database.mjs';
import {createApp} from './app.mjs';
import {createDemoPlan} from '../dist/server/budget.js';

export async function checkRecoveredApplication(source,{keyFile,publicKeyFile}={}){
 const directory=mkdtempSync(join(tmpdir(),'budgit-recovery-access-')),copy=join(directory,'copy.sqlite');let db;
 const check=(ok)=>{if(!ok)throw Error('Restored application access check failed');};
 try{
  const original=new DatabaseSync(source,{readOnly:true});try{original.prepare('VACUUM INTO ?').run(copy);}finally{original.close();}
  const opened=openDatabase(copy);db=opened.db;const DB=opened.DB;
  const prefix=randomUUID(),origin='https://recovery.invalid';let nonce,identity=0;
  const emails=[prefix+'-a@example.invalid',prefix+'-b@example.invalid'];
  for(const email of emails)db.prepare('INSERT INTO auth_access VALUES (?,?)').run(email,Date.now());
  const oauth={async generateCodeVerifierAsync(){return{codeVerifier:'recovery-test',codeChallenge:'recovery-test'};},generateAuthUrl(options){nonce=options.nonce;return origin+'/?state='+options.state;},async getToken(){return{tokens:{id_token:'synthetic-test-token'}};},async verifyIdToken(){return{getPayload:()=>({sub:prefix+'-'+identity,email:emails[identity],email_verified:true,nonce})};}};
  const handle=createApp({db,DB,origin,clientId:'recovery-test',clientSecret:'recovery-test',oauth,reportOptions:{...(keyFile?{keyFile}:{}),...(publicKeyFile?{publicKeyFile}:{})}});
  const request=(path,cookie,method='GET',body)=>handle(new Request(origin+path,{method,headers:{origin,...(cookie?{cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  check((await request('/api/plan')).status===401);
  check((await handle(new Request(origin+'/api/plan',{headers:{'oai-authenticated-user-id':db.prepare('SELECT user_id FROM plans LIMIT 1').get()?.user_id??'forged'}}))).status===401);
  const cookies=[],ids=[];
  for(identity=0;identity<2;identity++){
   const start=await request('/auth/google'),state=new URL(start.headers.get('Location')).searchParams.get('state');
   const callback=()=>request('/auth/google/callback?state='+state+'&code=synthetic','__Host-mf_oauth='+state);
   const signed=await callback();check(signed.status===303);check((await callback()).status===400);
   const cookie=signed.headers.getSetCookie().find(v=>v.startsWith('__Host-mf_session='))?.split(';')[0];check(!!cookie);cookies.push(cookie);
   ids.push(db.prepare('SELECT id FROM auth_users WHERE google_sub=?').get(prefix+'-'+identity).id);
   const own=await request('/api/plan',cookie);check(own.status===200);check((await own.json()).plan===null);
   for(const row of db.prepare('SELECT id FROM budgets').all()){
    check((await request('/api/plan?budget='+encodeURIComponent(row.id),cookie)).status===404);
    check((await request('/api/data/transactions?budget='+encodeURIComponent(row.id),cookie)).status===404);
   }
   check((await request('/api/admin/access',cookie)).status===403);
  }
  const plan=createDemoPlan('2026-10');plan.demo=false;
  check((await request('/api/plan',cookies[0],'PUT',{plan,revision:0})).status===200);
  check((await request('/api/plan',cookies[0],'PUT',{plan,revision:0})).status===409);
  check((await (await request('/api/plan',cookies[1])).json()).plan===null);
  const made=await request('/api/budgets',cookies[0],'POST',{name:'Recovery synthetic budget'});check(made.status===201);const id=(await made.json()).id;
  check((await request('/api/plan?budget='+id,cookies[0],'PUT',{plan,revision:0})).status===200);
  check((await request('/api/plan?budget='+id,cookies[1])).status===404);
  db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(id,ids[1],emails[1]);
  check((await request('/api/plan?budget='+id,cookies[1])).status===200);
  check((await request('/api/data/transactions?budget='+id,cookies[1])).status===200);
  db.prepare('DELETE FROM budget_members WHERE budget_id=? AND user_id=?').run(id,ids[1]);
  check((await request('/api/plan?budget='+id,cookies[1])).status===404);
  check((await request('/api/data/transactions?budget='+id,cookies[1])).status===404);
  db.prepare('DELETE FROM auth_access WHERE email=?').run(emails[1]);check((await request('/api/plan',cookies[1])).status===403);check((await request('/api/plan',cookies[1])).status===401);
  check((await request('/auth/logout',cookies[0],'POST')).status===303);check((await request('/api/plan',cookies[0])).status===401);
  return{applicationRequests:true,syntheticOAuthCallback:true,anonymousAndForgedIdentityDenied:true,personalIsolation:true,restoredBudgetsDeniedToOutsiders:true,sharedMembershipRevocation:true,accountAccessRevocation:true,revisionConflict:true,logoutRevocation:true};
 }finally{try{db?.close();}finally{rmSync(directory,{recursive:true,force:true});}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(!process.argv[2])throw Error();console.log(JSON.stringify(await checkRecoveredApplication(process.argv[2],{keyFile:process.argv[3],publicKeyFile:process.argv[4]})));}catch{console.error('Restored application access check failed; no private diagnostics emitted.');process.exitCode=1;}
}
