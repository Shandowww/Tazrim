// Development-only native Shortcut acceptance endpoint. Never used by the app.
import {createServer} from 'node:http';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {openDatabase} from '../server/database.mjs';
import {createReportStore} from '../server/report-store.mjs';
import {reportHash} from '../server/report-crypto.mjs';

export const qaModes=['success','missing-stored','stored-false','stored-string','wrong-hash','missing-receipt','malformed-json','unauthorized','unavailable','disconnect'];
const maxBytes=5*1024*1024;
const csv=Buffer.from('BUDGIT SYNTHETIC SHORTCUT QA ONLY\nname,amount\nfictional,1\n');
let publicKey;
function recoveryKey(){return publicKey??=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'}}).publicKey;}

export async function startReportShortcutQA({mode='success',port=0}={}){
 if(!qaModes.includes(mode))throw Error('Unknown QA mode');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
 const directory=mkdtempSync(join(tmpdir(),'budgit-shortcut-qa-'));
 const input=join(directory,'input'),uploaded=join(directory,'uploaded');
 mkdirSync(input);mkdirSync(uploaded);
 const filenames=['דוח בדיקה & 100%.csv','collision.csv'];
 for(const name of filenames)writeFileSync(join(input,name),csv,{flag:'wx',mode:0o600});
 writeFileSync(join(uploaded,'collision.csv'),'BUDGIT SYNTHETIC EXISTING DESTINATION — DO NOT OVERWRITE\n',{flag:'wx',mode:0o600});
 const {db,DB}=openDatabase(':memory:');
 const user={id:'shortcut-qa-only',email:'shortcut-qa@example.test'};
 db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user.id,'synthetic-shortcut-qa',user.email,0);
 let server,origin,store,token;
 let requests=0,rejectedBodies=0;
 const respond=(res,status,body,type='application/json')=>{
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(typeof body==='string'?body:JSON.stringify(body));
 };
 server=createServer(async(req,res)=>{
  try{
   // Restrict Host as well as binding; this is not an app session or a proxy.
   if(req.headers.host!==new URL(origin).host)return respond(res,403,{error:'QA host only'});
   const url=new URL(req.url,origin);
   if(url.pathname!=='/api/imports/reports')return respond(res,404,{error:'QA upload endpoint only'});
   if(req.headers.authorization!=='Bearer '+token)return respond(res,401,{error:'Synthetic QA token required'});
   if(!['POST','GET'].includes(req.method))return respond(res,405,{error:'Unsupported method'});
   let bytes;
   if(req.method==='POST'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>maxBytes)return respond(res,413,{error:'QA payload too large'});chunks.push(chunk);}
    bytes=Buffer.concat(chunks);
    // Even with the QA token, arbitrary real reports must not enter this sink.
    if(!bytes.equals(csv)||!filenames.includes(url.searchParams.get('name'))){rejectedBodies++;return respond(res,422,{error:'Only generated synthetic fixtures are accepted'});}
   }
   requests++;
   if(mode==='unauthorized')return respond(res,401,{error:'Synthetic revoked-token case'});
   if(mode==='unavailable')return respond(res,503,{error:'Synthetic service failure'});
   const response=await store.receive(new Request(url,{method:req.method,headers:{authorization:'Bearer '+token},...(bytes?{body:bytes}:{})}));
   const receipt=await response.json();
   if(!response.ok)return respond(res,response.status,receipt);
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
  store=createReportStore(db,{DB,origin,isAllowed:email=>email===user.email,key:randomBytes(32),recoveryPublicKey:recoveryKey()});
  const connected=await store.handle(new Request(origin+'/api/reports',{method:'POST',body:JSON.stringify({action:'connect',label:'Synthetic Shortcut QA only'})}),user);
  const connection=await connected.json();if(!connected.ok||!connection.secret)throw Error('QA setup failed');token=connection.secret;
 }catch(e){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});throw e;}
 return{
  origin,endpoint:origin+'/api/imports/reports',token,input,uploaded,filenames,mode,sourceHash:reportHash(csv),
  stats:()=>({requests,rejectedBodies,sources:db.prepare('SELECT COUNT(*) AS n FROM report_sources').get().n,budgets:db.prepare('SELECT COUNT(*) AS n FROM plans').get().n}),
  close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});},
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode='success',port='5174',...extra]=process.argv.slice(2);
 if(extra.length)throw Error('Usage: node scripts/report-shortcut-qa.mjs [mode] [port]');
 const qa=await startReportShortcutQA({mode,port:Number(port)});
 console.log(JSON.stringify({notice:'SYNTHETIC QA ONLY. Use a separate copy of the Shortcut. Never paste a production token here. Temporary fixtures are removed on exit.',endpoint:qa.endpoint,token:qa.token,input:qa.input,uploaded:qa.uploaded,mode:qa.mode,sourceHash:qa.sourceHash},null,2));
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;console.log(JSON.stringify({syntheticResults:qa.stats()}));await qa.close();});
}
