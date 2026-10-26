import http from 'node:http';
import {createDriveBackup} from './drive-backup.mjs';
import {createCardPush} from './card-push.mjs';
import {createRateService} from './interest-rates.mjs';
import {openDatabase} from './database.mjs';
import {createApp} from './app.mjs';
const recoveryCheck=process.env.BUDGIT_RECOVERY_CHECK==='1';
const origin=process.env.APP_ORIGIN??'https://budgit.duckdns.org';
const {db,DB}=openDatabase(process.env.DB_PATH??'/app/data/monthly-flow.sqlite');
const rates=createRateService(db);
const refreshRates=()=>rates.refresh().catch(()=>{});if(!recoveryCheck)refreshRates();const rateTimer=recoveryCheck?null:setInterval(refreshRates,6*3600000);rateTimer?.unref();
const push=createCardPush(db);
const backups=createDriveBackup({db,origin,clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,admins:new Set((process.env.ADMIN_GOOGLE_EMAILS??'').split(/[,\s]+/).map(s=>s.toLowerCase()).filter(Boolean)),source:process.env.DB_PATH??'/app/data/monthly-flow.sqlite'});
const handle=createApp({db,DB,origin,...(recoveryCheck?{reportOptions:{keyFile:process.env.RECOVERY_REPORT_KEY_FILE,publicKeyFile:process.env.RECOVERY_PUBLIC_KEY_FILE}}:{}),rates,push,backup:backups,clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,allowedEmails:process.env.ALLOWED_GOOGLE_EMAILS??'',adminEmails:process.env.ADMIN_GOOGLE_EMAILS??''});
backups.trackTables();
const gmailTimer=recoveryCheck?null:setInterval(()=>handle.tickGmail().catch(()=>{}),60000);gmailTimer?.unref();
const backupTimer=recoveryCheck?null:setInterval(()=>backups.tick().catch(()=>{}),60000);backupTimer?.unref();if(!recoveryCheck)backups.tick().catch(()=>{});
const server=http.createServer(async(req,res)=>{try{
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>12000000){res.writeHead(413);res.end();return;}chunks.push(c)}
 const ip=req.socket.remoteAddress;
 const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
 const result=await handle(request,{ip});const h=Object.fromEntries(result.headers);if(result.headers.getSetCookie().length)h['set-cookie']=result.headers.getSetCookie();res.writeHead(result.status,h);res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(503,{'Cache-Control':'no-store'});res.end('השירות אינו זמין כרגע');}});
server.requestTimeout=15000;server.headersTimeout=10000;server.listen(Number(process.env.PORT??3001),recoveryCheck?'127.0.0.1':'0.0.0.0',()=>{console.log('Monthly Flow standalone server ready');process.send?.({ready:true,port:server.address().port});});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(gmailTimer);clearInterval(backupTimer);clearInterval(rateTimer);server.close(()=>{db.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()});
