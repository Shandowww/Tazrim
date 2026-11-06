// Development-only native Shortcut acceptance endpoint. Never used by the app.
import {createServer} from 'node:http';
import {randomBytes,generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {zero} from '../src/budget.js';
import {reportHash} from '../server/report-crypto.mjs';

export const qaModes=['success','missing-stored','stored-false','stored-string','wrong-hash','missing-receipt','malformed-json','unauthorized','unavailable','disconnect'];
const maxBytes=5*1024*1024;
const csv=Buffer.from('הפועלים\nמספר חשבון 999001\nתאריך,תיאור,סכום,יתרה\n01/05/2026,משכורת בדיקה סינתטית,100,1100');
let publicKey;
function recoveryKey(){return publicKey??=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'}}).publicKey;}

export async function startIncomingShortcutQA({mode='success',port=0,token:qaToken}={}){
 if(!qaModes.includes(mode))throw Error('Unknown QA mode');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
 if(qaToken!==undefined&&(typeof qaToken!=='string'||!/^[-\w]{43}$/.test(qaToken)))throw Error('Invalid disposable QA token');
 const directory=mkdtempSync(join(tmpdir(),'budgit-shortcut-qa-'));
 const input=join(directory,'input'),uploaded=join(directory,'uploaded');
 mkdirSync(input);mkdirSync(uploaded);
 const filenames=['דוח בדיקה & 100%.CSV','collision.csv'];
 for(const name of filenames)writeFileSync(join(input,name),csv,{flag:'wx',mode:0o600});
 writeFileSync(join(uploaded,'collision.csv'),'BUDGIT SYNTHETIC EXISTING DESTINATION — DO NOT OVERWRITE\n',{flag:'wx',mode:0o600});
 const {db,DB}=openDatabase(':memory:');
 const user={id:'shortcut-qa-only',email:'shortcut-qa@example.test'};
 db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user.id,'synthetic-shortcut-qa',user.email,0);
 const appOrigin='https://shortcut-qa.test';let server,origin,app,token;
 let requests=0,rejectedBodies=0,arrivals=0,unauthorizedRequests=0;const events=[];
 const respond=(res,status,body,type='application/json')=>{
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(typeof body==='string'?body:JSON.stringify(body));
 };
 server=createServer(async(req,res)=>{
  try{
   arrivals++;
   // Restrict Host as well as binding; this is not an app session or a proxy.
   if(req.headers.host!==new URL(origin).host)return respond(res,403,{error:'QA host only'});
   const url=new URL(req.url,origin);
   if(url.pathname!=='/api/imports/incoming')return respond(res,404,{error:'QA upload endpoint only'});
   if(req.headers.authorization!=='Bearer '+token){unauthorizedRequests++;return respond(res,401,{error:'Synthetic QA token required'});}
   if(!['POST','GET'].includes(req.method))return respond(res,405,{error:'Unsupported method'});
   let bytes;
   if(req.method==='POST'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>maxBytes)return respond(res,413,{error:'QA payload too large'});chunks.push(chunk);}
    bytes=Buffer.concat(chunks);
    // Even with the QA token, arbitrary real reports must not enter this sink.
    if(!bytes.equals(csv)||!filenames.includes(url.searchParams.get('name'))){rejectedBodies++;return respond(res,422,{error:'Only generated synthetic fixtures are accepted'});}
   }
   requests++;events.push({method:req.method,kind:req.method==='POST'?'upload':url.searchParams.has('catalog')?'catalog':'receipt',mode});
   if(req.method==='POST'&&mode==='unauthorized')return respond(res,401,{error:'Synthetic revoked-token case'});
   if(req.method==='POST'&&mode==='unavailable')return respond(res,503,{error:'Synthetic service failure'});
   const response=await app(new Request(appOrigin+url.pathname+url.search,{method:req.method,headers:{authorization:'Bearer '+token},...(bytes?{body:bytes}:{})}));
   const receipt=await response.json();
   if(!response.ok)return respond(res,response.status,receipt);
   if(req.method==='GET')return respond(res,response.status,receipt);
   if(mode==='disconnect'){req.socket.destroy();return;}
   if(mode==='malformed-json')return respond(res,200,'{ "stored": true,');
   if(mode==='missing-stored')delete receipt.stored;
   if(mode==='stored-false')receipt.stored=false;
   if(mode==='stored-string')receipt.stored='true';
   if(mode==='wrong-hash')receipt.sourceHash='0'.repeat(64);
   if(mode==='missing-receipt')delete receipt.receiptId;
   respond(res,mode==='success'?response.status:200,receipt);
  }catch{if(!res.headersSent&&!res.destroyed)respond(res,503,{error:'Synthetic QA request failed'});else res.destroy();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  const session=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(reportHash(session),user.id,Date.now()+3600000);
  app=createApp({db,DB,origin:appOrigin,allowedEmails:[user.email],reportOptions:{key:randomBytes(32),recoveryPublicKey:recoveryKey()}});
  const handle=body=>app(new Request(appOrigin+'/api/report-intake',{method:'POST',headers:{origin:appOrigin,cookie:'__Host-mf_session='+session,'x-budget-account-id':user.id},body:JSON.stringify(body)}));
  // Internal app calls stay in memory; the HTTP sink exposes only transport.
  app.qaCall=(path,body,method=body?'POST':'GET')=>app(new Request(appOrigin+path,{method,headers:{origin:appOrigin,cookie:'__Host-mf_session='+session,'x-budget-account-id':user.id},...(body?{body:JSON.stringify(body)}:{})}));
  await handle({action:'consent',confirmServerRead:true});token=qaToken??randomBytes(32).toString('base64url');
  const connected=await handle({action:'connect',id:randomUUID(),secret:token,label:'Synthetic native incoming QA'});if(!connected.ok)throw Error('QA setup failed');
 }catch(e){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});throw e;}
 return{
  origin,endpoint:origin+'/api/imports/incoming',token,input,uploaded,filenames,mode,sourceHash:reportHash(csv),
  stats:()=>({requests,rejectedBodies,arrivals,unauthorizedRequests,events:[...events],sources:db.prepare('SELECT COUNT(*) AS n FROM report_sources').get().n,budgets:db.prepare('SELECT COUNT(*) AS n FROM plans').get().n}),
  setMode:value=>{if(!qaModes.includes(value))throw Error('Unknown QA mode');mode=value;},
  completeSavedImport:async()=>{
   const call=app.qaCall,checked=async response=>{if(!response.ok)throw Error('Synthetic isolated action failed: '+response.status+' '+await response.text());return response.json();};
   const snapshot=await checked(await call('/api/report-intake'));
   if(snapshot.reports.length!==1)throw Error('Upload the generated fixture first (one unique hash expected)');
   const row=snapshot.reports[0];
   if(row.route)throw Error('Synthetic fixture already routed; restart for another import');
   const plan={startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'bank-qa',label:'חשבון סינתטי',buffer:0}],months:{},cardAccounts:{},transfers:[]}};
   await checked(await call('/api/plan',{plan,revision:0},'PUT'));
   const ref={id:row.id,sourceHash:row.sourceHash,revision:row.revision,confirm:true};
   await checked(await call('/api/report-intake',{...ref,action:'approve'}));
   const route=await checked(await call('/api/report-intake',{...ref,action:'route',budget:'personal',budgetRevision:1,kind:'bank',target:'bank-qa',identityKey:'',remember:false}));
   const {readReportContent}=await import('../frontend/src/app/report-reader.ts');
   const {buildReportInbox,reportInboxDraftForWrite}=await import('../src/report-inbox-controller.js');
   const classifier=await import('../tools/bank-csv/classifier.mjs');
   const parsed=await readReportContent(filenames[0],csv,new AbortController().signal);
   const item={...parsed,id:randomUUID(),name:filenames[0],target:'bank-qa',payer:'',decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},storedId:route.reportId,storedRevision:1,skip:false};
   const base=await checked(await call('/api/plan')),ui={items:[item],categoryChoices:new Map(),bankChoices:new Map(),newAccounts:[],newCards:[],duplicates:0};
   await buildReportInbox(base.plan,ui,{month:'2026-05',today:'2026-11-06',classifier,activityAPI:null});
   if(ui.issues||!ui.build)throw Error('Synthetic original review failed');
   await checked(await call('/api/reports',{action:'draft-batch',reports:[{id:route.reportId,revision:1,state:'ready'}],draft:reportInboxDraftForWrite(ui,[item],'native-qa')}));
   await checked(await call('/api/reports',{action:'commit',actionId:randomUUID(),revision:base.revision,plan:ui.build,reports:[{id:route.reportId,revision:2}]}));
   const response=await app(new Request(appOrigin+'/api/imports/incoming?receipt='+row.id+'&hash='+row.sourceHash,{headers:{authorization:'Bearer '+token}}));
   const receipt=await checked(response);if(receipt.cleanupEligible!==true)throw Error('Real full-import receipt did not authorize cleanup');return receipt;
  },
  close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});},
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode='success',port='5174',configPath,...extra]=process.argv.slice(2);
 if(extra.length||!configPath)throw Error('Usage: node scripts/incoming-shortcut-qa.mjs <mode> <port> <private-config-path>');
 const qa=await startIncomingShortcutQA({mode,port:Number(port)});
 writeFileSync(configPath,JSON.stringify({endpoint:qa.endpoint,token:qa.token}),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({notice:'SYNTHETIC QA ONLY. Use a separate copy of the Shortcut. Never paste a production token here. Temporary fixtures are removed on exit.',endpoint:qa.endpoint,input:qa.input,uploaded:qa.uploaded,mode:qa.mode,sourceHash:qa.sourceHash},null,2));
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;console.log(JSON.stringify({syntheticResults:qa.stats()}));await qa.close();rmSync(configPath,{force:true});});
}
