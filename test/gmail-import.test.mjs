import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';import {createReportStore} from '../server/report-store.mjs';import {createGmailImport,gmailFilters,bankMailNotice,gmailStartDay} from '../server/gmail-import.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),origin='https://app.test',user={id:'alice',email:'alice@test'},b64=s=>Buffer.from(s).toString('base64url');
test('Gmail date filters begin at midnight in Israel across winter and summer',()=>{assert.equal(new Date(gmailStartDay('2026-01-01')*1000).toISOString(),'2025-12-31T22:00:00.000Z');assert.equal(new Date(gmailStartDay('2026-06-01')*1000).toISOString(),'2026-05-31T21:00:00.000Z');});
test('filters require a bounded selection and bank notice only extracts explicit valid dates as plain text',()=>{
 assert.throws(()=>gmailFilters({senders:[],labels:[],from:'2026-10-01'}));assert.throws(()=>gmailFilters({senders:['bank@test.example'],labels:[],from:'2026-02-31'}));
 const n=bankMailNotice({id:'m',internalDate:'1792280000000',payload:{headers:[{name:'Subject',value:'סיום הטבה'},{name:'From',value:'בנק <bank@test.example>'}],parts:[{mimeType:'text/html',body:{data:b64('<img src="https://tracker">הפטור מעמלה בתוקף עד 31.12.2026 <script>evil()</script>')}}]}});assert.equal(n.explicitDate,'2026-12-31');assert.ok(!n.text.includes('<img'));assert.equal(bankMailNotice({payload:{headers:[{name:'Subject',value:'news'}]}}),null);
});
test('Gmail consent, preview and bounded pagination ingest duplicates safely; mailbox notices stay private and disconnect cancels access',async()=>{
 const {db,DB}=openDatabase(':memory:'),requests=[],allowed=new Set(['alice@test','bob@test']);let auth,nonce,revoked=false,pageCount=0;
 const message={id:'m1',internalDate:'1792280000000',payload:{headers:[{name:'Subject',value:'עדכון עמלה'},{name:'From',value:'Bank <bank@test.example>'}],parts:[{filename:'statement.csv',mimeType:'text/csv',body:{size:7,data:b64('a,b\n1,2')}},{mimeType:'text/plain',body:{data:b64('עדכון עמלה החל מ 31.12.2026')}}]}};
 const factory=()=>({
  generateCodeVerifierAsync:async()=>({codeVerifier:'verifier',codeChallenge:'challenge'}),
  generateAuthUrl:options=>{auth=options;nonce=options.nonce;return 'https://accounts.google.test/consent';},
  getToken:async()=>({tokens:{refresh_token:'synthetic-refresh-secret',id_token:'fake',scope:'openid email https://www.googleapis.com/auth/gmail.readonly'}}),
  verifyIdToken:async()=>({getPayload:()=>({email:user.email,email_verified:true,nonce})}),setCredentials(){},
  request:async options=>{
   const url=new URL(options.url);requests.push(url);
   if(url.pathname.endsWith('/messages')){
    if(url.searchParams.get('maxResults')==='10')return {data:{messages:[{id:'m1'}]}};
    pageCount++;return {data:{messages:[{id:pageCount===1?'m1':'m2'}],...(pageCount===1?{nextPageToken:'next'}:{})}};
   }
   if(/\/messages\/m[12]$/.test(url.pathname))return {data:{...message,id:url.pathname.split('/').at(-1)}};
   throw Error('unexpected endpoint');
  }
 });
 const reports=createReportStore(db,{DB,origin,isAllowed:e=>allowed.has(e),key:randomBytes(32),recoveryPublicKey:pair.publicKey}),gmail=createGmailImport(db,{origin,clientId:'client',clientSecret:'secret',isAllowed:e=>allowed.has(e),reportStore:reports,oauthFactory:factory,now:()=>1792280000000}),call=(body,who=user)=>gmail.handle(new Request(origin+'/api/gmail?budget=personal',{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),who);
 try{db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user.id,'g-alice',user.email,0);const begin=await gmail.begin(new Request(origin+'/auth/gmail'),user);assert.equal(begin.status,303);assert.ok(auth.scope.includes('https://www.googleapis.com/auth/gmail.readonly'));assert.ok(!auth.scope.some(s=>s.includes('modify')||s.includes('send')));
 const callback=await gmail.callback(new Request(origin+'/auth/google/callback?state='+auth.state+'&code=fake'),user);assert.equal(callback.status,303);assert.ok(callback.headers.get('location').includes('connected'));assert.equal((await gmail.callback(new Request(origin+'/auth/google/callback?state='+auth.state+'&code=fake'),user)).status,400);
 const row=db.prepare('SELECT data FROM gmail_connections').get();assert.ok(!Buffer.from(row.data).includes('synthetic-refresh-secret'));
 const filters={senders:['bank@test.example'],labels:[],from:'2026-10-01'};assert.equal((await call({action:'configure',revision:1,filters,confirmRead:true})).status,409);assert.equal((await call({action:'preview',filters})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_sources').get().n,0);assert.equal((await call({action:'configure',revision:1,filters,confirmRead:true})).status,200);
 let result=await (await call({action:'scan'})).json();assert.equal(result.incomplete,true);assert.equal(result.stored,1);result=await (await call({action:'scan'})).json();assert.equal(result.incomplete,false);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_sources').get().n,1);assert.equal((await (await call(null,{id:'bob',email:'bob@test'})).json()).notices.length,0);
 const own=await (await call()).json();assert.equal(own.notices.length,1);assert.equal(own.notices[0].state,'info');await call({action:'notice-state',id:'m1',state:'review',revision:1});assert.equal((await call({action:'notice-state',id:'m1',state:'done',revision:1})).status,409);
 await call({action:'disconnect'});assert.equal((await call({action:'scan'})).status,400);assert.ok(requests.every(u=>u.origin==='https://gmail.googleapis.com'));assert.ok(requests.every(u=>!u.pathname.includes('/send')));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_sources').get().n,1);
 }finally{db.close();}
});
test('Gmail retry stores a bounded error and backs off; recovery authenticates mailbox ciphertext',async()=>{
 const {verifyStoredReports}=await import('../server/report-crypto.mjs'),{sealReport}=await import('../server/report-crypto.mjs');const {db,DB}=openDatabase(':memory:'),key=randomBytes(32);let calls=0,clock=1792280000000;
 const reports=createReportStore(db,{DB,origin,isAllowed:()=>true,key,recoveryPublicKey:pair.publicKey}),gmail=createGmailImport(db,{origin,clientId:'c',clientSecret:'s',isAllowed:()=>true,reportStore:reports,now:()=>clock,oauthFactory:()=>({setCredentials(){},request:async()=>{calls++;throw Error('sensitive provider data');}})});
 try{db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run('alice','a',user.email,0);const data=sealReport(reports.secret(),Buffer.from(JSON.stringify({tokens:{refresh_token:'private-token'},filters:{senders:['bank@test.example'],labels:[],from:'2026-10-01'}})),'gmail|alice|personal');db.prepare('INSERT INTO gmail_connections(user_id,budget,data,enabled) VALUES(?,?,?,1)').run('alice','personal',data);
 assert.equal(verifyStoredReports(db,key),0);await gmail.tick();assert.equal(calls,1);let row=db.prepare('SELECT error,failures FROM gmail_connections').get();assert.equal(row.failures,1);assert.ok(!row.error.includes('sensitive'));clock+=10*60000;await gmail.tick();assert.equal(calls,1);clock+=10*60000;await gmail.tick();assert.equal(calls,2);
 const bad=Buffer.from(data);bad[20]^=1;db.prepare('UPDATE gmail_connections SET data=?').run(bad);assert.throws(()=>verifyStoredReports(db,key));
 }finally{db.close();}
});
