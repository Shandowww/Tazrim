// Disposable iPhone acceptance: generated files only, no production connection.
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,rmSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {startIncomingShortcutQA} from './incoming-shortcut-qa.mjs';

const qa=await startIncomingShortcutQA(),nonce=randomBytes(24).toString('hex'),base='/qa/'+nonce;
const fixture=readFileSync(join(qa.input,qa.filenames[0]));
let artifactName='Budgit-iPhone-QA',signedBytes,closed=false,tunnel,expiry,rl,proxyOrigin;
const reply=(res,status,body,type='text/plain; charset=utf-8',headers={})=>{
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(body);
};
const proxy=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==new URL(proxyOrigin).host)return reply(res,403,'Synthetic QA host only');
  const url=new URL(req.url,proxyOrigin);
  if(req.method==='GET'&&url.pathname===base+'/')return reply(res,200,`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>בדיקת סנכרון Budgit</title><style>body{font:17px -apple-system,system-ui;max-width:40rem;margin:auto;padding:24px;line-height:1.7}a{display:block;padding:16px;margin:12px 0;border:1px solid #8888;border-radius:16px}code{direction:ltr;unicode-bidi:isolate}</style><h1>בדיקה עם קובץ סינתטי בלבד</h1><p>הבדיקה אינה מחוברת לתקציב האמיתי. הכתובת והקיצור זמניים.</p><ol><li>צרו ב־Files תיקייה נפרדת בשם Budgit-QA.</li><li>הורידו את דוח הבדיקה ושמרו אותו בתיקייה הזו, בשם המקורי.</li><li>התקינו את הקיצור שמתחת ובחרו בו רק את תיקיית Budgit-QA. מפתח הבדיקה כבר מוגדר, וכך גם <code>delete-after-upload</code>.</li><li>לבדיקה ללא שאלת מחיקה חוזרת, הפעילו בהגדרות iOS ← יישומים ← קיצורים ← מתקדם את האפשרות למחיקה ללא אישור. זו הגדרה לכל הקיצורים. הריצו ב־iPhone ואשרו הרשאות ראשוניות לכתובת ולתיקיית הבדיקה אם נשאלתם. אחרי אימות שמירה, הקובץ אמור להיעלם מהתיקייה. דווחו אם נמחק ונבדוק שהעותק בשרת נשמר.</li></ol><a href="${base}/fixture.csv" download="collision.csv">הורדת דוח בדיקה סינתטי</a><a href="${base}/qa.shortcut" download="${artifactName}.shortcut">התקנת קיצור הבדיקה ל־iPhone</a><p>אין לבחור את תיקיית הדוחות האמיתיים. מחיקת קובץ מתיקיית iCloud מסתנכרנת גם למכשירים אחרים. הבדיקה פגה אוטומטית אחרי 20 דקות.</p></html>`,'text/html; charset=utf-8',{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  if(req.method==='GET'&&url.pathname===base+'/fixture.csv')return reply(res,200,fixture,'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="collision.csv"'});
  if(req.method==='GET'&&url.pathname===base+'/qa.shortcut'&&signedBytes)return reply(res,200,signedBytes,'application/octet-stream',{'Content-Disposition':'attachment; filename="'+artifactName+'.shortcut"'});
  if(url.pathname!=='/api/imports/incoming'||!['GET','POST'].includes(req.method))return reply(res,404,'Synthetic endpoint only');
  if(req.headers.authorization!=='Bearer '+qa.token)return reply(res,401,'Synthetic QA token required');
  let body;
  if(req.method==='POST'){
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>fixture.length)return reply(res,422,'Only the generated fixture is accepted');chunks.push(chunk);}
   body=Buffer.concat(chunks);
   if(!qa.filenames.includes(url.searchParams.get('name'))||!body.equals(fixture))return reply(res,422,'Only the generated fixture is accepted');
  }
  const upstream=await fetch(qa.origin+url.pathname+url.search,{method:req.method,headers:{authorization:'Bearer '+qa.token},...(body?{body}:{})});
  reply(res,upstream.status,Buffer.from(await upstream.arrayBuffer()),upstream.headers.get('content-type')??'application/json');
 }catch{if(!res.headersSent)reply(res,503,'Synthetic QA request unavailable');else res.destroy();}
});
async function close(){if(closed)return;closed=true;clearTimeout(expiry);tunnel?.kill('SIGTERM');rl?.close();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));console.log(JSON.stringify({final:qa.stats(),storedOriginal:await qa.verifyStoredOriginal()}));await qa.close();}
try{
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});proxyOrigin='http://127.0.0.1:'+proxy.address().port;
 const binary=existsSync('work/ui-redesign/cloudflared')?'work/ui-redesign/cloudflared':'cloudflared';
 tunnel=spawn(binary,['tunnel','--no-autoupdate','--url',proxyOrigin,'--http-host-header',new URL(proxyOrigin).host,'--protocol','http2'],{stdio:['ignore','pipe','pipe']});
 const publicOrigin=await new Promise((resolve,reject)=>{
  let output='';const timer=setTimeout(()=>reject(Error('Temporary HTTPS tunnel did not become ready')),45000);
  const observe=chunk=>{output=(output+chunk.toString()).slice(-20000);const match=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){clearTimeout(timer);resolve(match[0]);}};
  tunnel.stdout.on('data',observe);tunnel.stderr.on('data',observe);tunnel.once('error',e=>{clearTimeout(timer);reject(e)});tunnel.once('exit',()=>{clearTimeout(timer);reject(Error('Temporary HTTPS tunnel stopped'))});
 });
 const name='Budgit-Incoming-QA-iphone-'+randomBytes(4).toString('hex'),directory=join(qa.input,'..'),config=join(directory,'phone-config.json'),unsigned=join(directory,'phone.wflow'),signed=join(directory,name+'.shortcut');
 artifactName=name;
 writeFileSync(config,JSON.stringify({endpoint:publicOrigin+'/api/imports/incoming',token:qa.token,qaName:name,syntheticHttps:true,cleanupMode:'delete-after-upload'}),{mode:0o600,flag:'wx'});
 execFileSync('python3',['-B','scripts/build-incoming-shortcut.py','--qa-config',config,'--output',unsigned],{timeout:15000});chmodSync(unsigned,0o600);
 execFileSync('shortcuts',['sign','--mode','anyone','--input',unsigned,'--output',signed],{stdio:'pipe',timeout:30000});chmodSync(signed,0o600);
 signedBytes=readFileSync(signed);rmSync(config);rmSync(unsigned);
 console.log(JSON.stringify({url:publicOrigin+base+'/',shortcutName:name,expiresMinutes:20,commands:['status','mode <fault-mode>','close']}));
 expiry=setTimeout(()=>void close(),20*60000);process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
 rl=createInterface({input:process.stdin,terminal:false});rl.on('close',()=>void close());
 rl.on('line',async line=>{const [command,arg]=line.trim().split(/\s+/);try{if(command==='close')await close();else if(command==='mode'){qa.setMode(arg);console.log('Synthetic mode: '+arg)}else if(command==='status')console.log(JSON.stringify({stats:qa.stats(),storedOriginal:await qa.verifyStoredOriginal()}));}catch{console.log('Synthetic command failed');}});
}catch(error){await close();throw error;}
