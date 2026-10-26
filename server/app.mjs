import {createPlanHistory} from './plan-history.mjs';
import {createGmailImport} from './gmail-import.mjs';
import {createReportStore} from './report-store.mjs';
import {createSpaceMigrationReview} from './space-migration-review.mjs';
import {createTransferMatches} from './transfer-matches.mjs';
import {createActions} from './actions.mjs';
import {reactUiResponse} from './react-ui.mjs';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {queryFinancialTransactions} from './financial-data.mjs';
import {createApplePay} from './apple-pay.mjs';
import {OAuth2Client} from 'google-auth-library';
import worker from '../dist/server/index.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
// Authorize exact delivered script bodies. Dynamic HTML is hashed after injection.
export function scriptReportPolicy(html){
 const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].filter(match=>match[1]).map(match=>"'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'");
 return "default-src 'self'; script-src 'self' "+[...new Set(hashes)].join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
}
const cookies=r=>Object.fromEntries((r.headers.get('cookie')??'').split(';').map(v=>{const i=v.indexOf('=');return[v.slice(0,i).trim(),v.slice(i+1)]}));
const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
const response=(body,status=200,extra={})=>new Response(body,{status,headers:{...headers,...(typeof body==='string'&&body.startsWith('<!doctype html>')?{'Content-Security-Policy':scriptReportPolicy(body)}:{}),...extra}});
const redirect=(url,setCookie)=>response(null,303,{Location:url,...(setCookie?{'Set-Cookie':setCookie}:{})});
const json=(body,status)=>response(JSON.stringify(body),status,{'Content-Type':'application/json; charset=utf-8'});
const safeReturn=value=>value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/';
const loginPage=message=>`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Budgit · כניסה</title><link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-v1.png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon-v1.png"><link rel="manifest" href="/manifest.webmanifest"><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:light-dark(#f8f5f0,#1b1e27);color:light-dark(#272735,#eee);font-family:-apple-system,BlinkMacSystemFont,system-ui}main{margin:20px;padding:32px;max-width:360px;border-radius:24px;background:light-dark(#fff,#282c38)}h1{font-size:28px}p{line-height:1.6}a{display:block;text-align:center;padding:14px;background:#7056b2;color:white;border-radius:16px;text-decoration:none;font-weight:600}.error{color:light-dark(#b52c25,#ffb3ae)}</style><main><h1>Budgit</h1><p>מתחברים כדי לפתוח את התקציב הפרטי, או תקציב משותף שהוזמנת אליו.</p>${message?'<p class="error" role="alert">'+message+'</p>':''}<a href="/auth/google">כניסה עם Google</a><p>הכניסה נותנת גישה לפרופיל ולאימייל בלבד, ללא גישה לבנק או לקבצי Google.</p></main></html>`;
export function createApp({db,DB,origin,clientId,clientSecret,allowedEmails=[],adminEmails=[],rates,push,backup,oauth,gmailOAuthFactory,reportOptions={},now=()=>Date.now()}){
 const base=new URL(origin);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash)throw Error('APP_ORIGIN must be an HTTPS origin');
 const normalize=value=>(Array.isArray(value)?value:String(value).split(/[,\s]+/)).map(email=>email.trim().toLowerCase()).filter(Boolean);
 const admins=new Set(normalize(adminEmails));
 const seeds=new Set((Array.isArray(allowedEmails)?allowedEmails:String(allowedEmails).split(/[,\s]+/)).map(email=>email.trim().toLowerCase()).filter(Boolean));
 if(seeds.size&&!db.prepare('SELECT id FROM auth_access_state WHERE id=1').get()){db.exec('BEGIN IMMEDIATE');try{for(const email of seeds)db.prepare('INSERT OR IGNORE INTO auth_access VALUES (?,?)').run(email,now());db.prepare('INSERT INTO auth_access_state VALUES (1,0)').run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 const isAllowed=email=>admins.has(email)||!!db.prepare('SELECT email FROM auth_access WHERE email=?').get(email);
 const reportStore=createReportStore(db,{...reportOptions,DB,origin:base.origin,isAllowed,now,savePlan:(user,budget,plan,revision,storage)=>worker.fetch(new Request(base.origin+'/api/plan?budget='+encodeURIComponent(budget),{method:'PUT',headers:{origin:base.origin,'Content-Type':'application/json','oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email},body:JSON.stringify({plan,revision})}),{DB:history.storage(storage,user,budget,'report-import')})});
 const history=createPlanHistory(db,{isAllowed,secret:reportStore.secret,now,savePlan:(user,budget,plan,revision,kind)=>worker.fetch(new Request(base.origin+'/api/plan?budget='+encodeURIComponent(budget),{method:'PUT',headers:{origin:base.origin,'Content-Type':'application/json','oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email},body:JSON.stringify({plan,revision})}),{DB:history.storage(DB,user,budget,kind)})});
 const gmail=createGmailImport(db,{origin:base.origin,clientId,clientSecret,isAllowed,reportStore,now,...(gmailOAuthFactory?{oauthFactory:gmailOAuthFactory}:{})});
 const migrationReview=createSpaceMigrationReview(db,{isAllowed});
 const transferMatches=createTransferMatches(db,{isAllowed,secret:reportStore.secret,now});
 const actions=createActions(db,{isAllowed,now,reports:reportStore.list});
 origin=base.origin;const wallet=createApplePay(db,{origin,now,isAllowed});const configured=!!(clientId&&clientSecret);oauth??=new OAuth2Client(clientId,clientSecret,origin+'/auth/google/callback');
 const handle=async function handle(request,{ip='unknown'}={}){
 const u=new URL(request.url),path=u.pathname,time=now();const jar=cookies(request);
 const session=jar['__Host-mf_session'],user=session?db.prepare('SELECT u.id,u.email FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?').get(digest(session),time):null;
 const cleanup=()=>{for(const table of ['auth_pending','auth_sessions','auth_limits'])db.prepare(`DELETE FROM ${table} WHERE expires_at<=?`).run(time)};
 if((path==='/shortcuts/install'||path==='/shortcuts/budgit-apple-pay-ios27.shortcut'||path==='/shortcuts/budgit-apple-pay.shortcut'||path==='/manifest.webmanifest'||path==='/sw.js'||/^\/icons\/[a-zA-Z0-9.-]+\.(png|ico)$/.test(path)||path==='/favicon.ico')&&['GET','HEAD'].includes(request.method)){const assetRequest=new Request(origin+(path==='/favicon.ico'?'/icons/favicon-v1.png':path),{method:request.method});const r=await worker.fetch(assetRequest,{DB});const h=new Headers(r.headers);for(const [k,v]of Object.entries(headers))if(k!=='Cache-Control')h.set(k,v);if(path==='/sw.js')h.set('Service-Worker-Allowed','/');if(path==='/shortcuts/install'&&request.method==='GET'&&r.ok){const html=await r.text();h.set('Content-Security-Policy',scriptReportPolicy(html));return new Response(html,{status:r.status,headers:h});}return new Response(r.body,{status:r.status,headers:h});}
 if(path==='/api/imports/reports')return reportStore.receive(request);
 if(path==='/api/imports/apple-pay')return wallet(request);
 if(path==='/api/health')return json({ok:true,loginConfigured:configured},200);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==origin)return json({error:'מקור הבקשה אינו תקין.'},403);
 if(path==='/auth/google'&&request.method==='GET'){
  if(!configured)return response(loginPage('הכניסה עדיין בהגדרה. נסו שוב לאחר השלמת ההקמה.'),503,{'Content-Type':'text/html; charset=utf-8'});
  cleanup();const key=digest(ip);db.prepare('INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(hash) DO UPDATE SET count=count+1').run(key,time+600000);if(db.prepare('SELECT count FROM auth_limits WHERE hash=?').get(key).count>30)return json({error:'יותר מדי ניסיונות כניסה. נסו שוב בעוד כמה דקות.'},429);
  const state=token(),nonce=token(),pkce=await oauth.generateCodeVerifierAsync();db.prepare('INSERT INTO auth_pending VALUES (?,?,?,?,?)').run(digest(state),pkce.codeVerifier,nonce,safeReturn(u.searchParams.get('returnTo')),time+600000);
  return redirect(oauth.generateAuthUrl({scope:['openid','email','profile'],state,nonce,code_challenge:pkce.codeChallenge,code_challenge_method:'S256',prompt:'select_account'}),cookie('__Host-mf_oauth',state,600));
 }
 if(path==='/auth/google/callback'&&u.searchParams.get('state')?.startsWith('gmi.'))return user?gmail.callback(request,user):json({error:'יש להתחבר מחדש לפני חיבור Gmail.'},401);
 if(backup&&path==='/auth/google/callback'&&request.method==='GET'&&u.searchParams.get('state')?.startsWith('dbk.'))return backup.callback(request,user&&isAllowed(user.email)?user:null);
 if(path==='/auth/google/callback'&&request.method==='GET'){
  const state=u.searchParams.get('state');if(!configured||!state||state!==jar['__Host-mf_oauth'])return response(loginPage('הכניסה לא אומתה. התחילו מחדש.'),400,{'Content-Type':'text/html; charset=utf-8'});
  const hash=digest(state),pending=db.prepare('DELETE FROM auth_pending WHERE hash=? AND expires_at>? RETURNING *').get(hash,time);
  if(!pending||!u.searchParams.get('code'))return response(loginPage('הכניסה בוטלה או פגה. אפשר לנסות שוב.'),400,{'Content-Type':'text/html; charset=utf-8'});
  try{
   const {tokens}=await oauth.getToken({code:u.searchParams.get('code'),codeVerifier:pending.verifier});
   if(!tokens.id_token)throw Error('missing identity');const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId}),identity=ticket.getPayload();
   if(!identity?.sub||!identity.email||identity.email_verified!==true||identity.nonce!==pending.nonce)throw Error('invalid identity');
   if(!isAllowed(identity.email.trim().toLowerCase()))return response(loginPage('החשבון הזה אינו מורשה להיכנס. בחרו חשבון שאושר לגישה.'),403,{'Content-Type':'text/html; charset=utf-8','Set-Cookie':cookie('__Host-mf_oauth','',0)});
   db.prepare('INSERT INTO auth_users VALUES (?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email').run(randomUUID(),identity.sub,identity.email.trim().toLowerCase(),time);
   const user=db.prepare('SELECT id FROM auth_users WHERE google_sub=?').get(identity.sub),session=token();db.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(digest(session),user.id,time+7*86400000);
   const result=redirect(pending.return_to,cookie('__Host-mf_session',session,7*86400));result.headers.append('Set-Cookie',cookie('__Host-mf_oauth','',0));return result;
  }catch{return response(loginPage('לא ניתן להשלים את הכניסה. נסו שוב.'),401,{'Content-Type':'text/html; charset=utf-8'});}
 }
 if(path==='/auth/logout'&&request.method==='POST'){if(session)db.prepare('DELETE FROM auth_sessions WHERE hash=?').run(digest(session));return redirect('/',cookie('__Host-mf_session','',0));}
 if(!user){if(path.startsWith('/api/'))return json({error:'יש להתחבר עם Google כדי לפתוח את התקציב.'},401);if(path==='/'||path==='/next'||path.startsWith('/next/'))return response(loginPage(),200,{'Content-Type':'text/html; charset=utf-8'});return response('העמוד לא נמצא',404);}
 if(!isAllowed(user.email.trim().toLowerCase())){db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(user.id);return path.startsWith('/api/')?json({error:'הגישה לחשבון זה אינה מורשית.'},403):response(loginPage('החשבון הזה אינו מורשה להיכנס. בחרו חשבון שאושר לגישה.'),403,{'Content-Type':'text/html; charset=utf-8','Set-Cookie':cookie('__Host-mf_session','',0)});}
 const ui=reactUiResponse(request);if(ui){const h=new Headers(ui.headers);for(const [k,v]of Object.entries(headers))if(k!=='Cache-Control')h.set(k,v);return new Response(ui.body,{status:ui.status,headers:h});}
 if(path==='/auth/gmail'&&request.method==='GET')return gmail.begin(request,user);
 if(path==='/api/gmail')return gmail.handle(request,user);
 if(path==='/auth/backup-drive'&&request.method==='GET')return backup?backup.begin(user):json({error:'גיבוי חיצוני אינו מוגדר.'},503);
 if(path==='/api/admin/backup/files'&&request.method==='GET')return backup?backup.files(request,user):json({error:'גיבוי חיצוני אינו מוגדר.'},503);
 if(path==='/api/admin/backup')return backup?backup.handle(request,user):json({error:'גיבוי חיצוני אינו מוגדר.'},503);
 if(path==='/api/data/transactions'){
  if(request.method!=='GET')return json({error:'הפעולה אינה נתמכת.'},405);
  const budget=u.searchParams.get('budget')||'personal';let scope;
  if(budget==='personal')scope='personal:'+user.id;
  else if(db.prepare('SELECT id FROM budgets b WHERE id=? AND (owner_id=? OR EXISTS(SELECT 1 FROM budget_members m WHERE m.budget_id=b.id AND m.user_id=?))').get(budget,user.id,user.id))scope='budget:'+budget;
  else return json({error:'התקציב אינו זמין לחשבון הזה.'},404);
  const filters=Object.fromEntries(u.searchParams);
  if(Object.values(filters).some(v=>v.length>255)||['min','max','limit','offset','revision'].some(k=>filters[k]!==undefined&&(!/^-?\d+$/.test(filters[k])||!Number.isSafeInteger(Number(filters[k])))))return json({error:'מסנני החיפוש אינם תקינים.'},400);
  if(['from','to'].some(k=>filters[k]&&!/^20\d{2}-\d{2}-\d{2}$/.test(filters[k])))return json({error:'יש לבחור תאריכים תקינים.'},400);
  for(const k of ['min','max','limit','offset','revision'])if(filters[k]!==undefined)filters[k]=Number(filters[k]);
  const result=queryFinancialTransactions(db,scope,filters);
  if(result.conflict)return json({error:'התקציב השתנה בין עמודי החיפוש. התחילו מחדש כדי לשמור על רשימה עקבית.',revision:result.revision},409);
  return result.encrypted?json({error:'התקציב מוצפן. החיפוש דורש פתיחה במכשיר.',encrypted:true},409):json(result,200);
 }
 if(path==='/api/card-push'||path==='/api/card-push/schedule'||path==='/api/card-push/test'){if(!push)return json({error:'התראות אינן זמינות כרגע.'},503);return push.handle(request,user);}
 if(path==='/api/plan-history')return history.handle(request,user);
 if(path==='/api/reports')return reportStore.handle(request,user);
 if(path==='/api/space-migration-review')return migrationReview(request,user);
 if(path==='/api/transfer-matches')return transferMatches(request,user);
 if(path==='/api/actions')return actions(request,user);
 if(path==='/api/apple-pay')return wallet(request,user);
 if(path==='/api/reference/interest'&&request.method==='GET'){if(!rates)return json({error:'נתוני הריבית אינם זמינים כרגע.'},503);return json(rates.snapshot(),200);}
 if(path==='/api/admin/access'){
  if(!admins.has(user.email))return json({error:'רק מנהל האפליקציה יכול לנהל גישה.'},403);
  const snapshot=()=>({revision:db.prepare('SELECT revision FROM auth_access_state WHERE id=1').get()?.revision??0,entries:[...new Set([...admins,...db.prepare('SELECT email FROM auth_access').all().map(r=>r.email)])].sort().map(email=>({email,admin:admins.has(email)}))});
  if(request.method==='GET')return json(snapshot(),200);
  if(request.method!=='PUT')return json({error:'הפעולה אינה נתמכת.'},405);
  let input;try{input=await request.json()}catch{return json({error:'הבקשה אינה תקינה.'},400)}
  const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  if(email.length>254||! /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)||!['add','remove'].includes(input?.action)||!Number.isSafeInteger(input?.revision)||input.revision<0)return json({error:'יש להזין כתובת אימייל תקינה.'},400);
  if(admins.has(email)&&input.action==='remove')return json({error:'לא ניתן להסיר את חשבון המנהל.'},400);
  if(input.action==='add'&&!isAllowed(email)&&snapshot().entries.length>=200)return json({error:'רשימת הגישה מלאה.'},400);
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('INSERT OR IGNORE INTO auth_access_state VALUES (1,0)').run();
   const update=db.prepare('UPDATE auth_access_state SET revision=revision+1 WHERE id=1 AND revision=?').run(input.revision);
   if(!update.changes){db.exec('ROLLBACK');return json({error:'רשימת הגישה השתנתה. רעננו אותה ונסו שוב.'},409)}
   if(input.action==='add')db.prepare('INSERT OR IGNORE INTO auth_access VALUES (?,?)').run(email,time);
   else{db.prepare('DELETE FROM auth_access WHERE email=?').run(email);db.prepare('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE email=?)').run(email);}
   db.exec('COMMIT');return json(snapshot(),200);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 const clean=new Headers(request.headers);for(const name of [...clean.keys()])if(name.startsWith('oai-')||name.startsWith('x-forwarded-'))clean.delete(name);
 clean.set('oai-authenticated-user-id',user.id);clean.set('oai-authenticated-user-email',user.email);
 const r=await worker.fetch(new Request(origin+u.pathname+u.search,{method:request.method,headers:clean,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer()}),{DB:path==='/api/plan'&&request.method==='PUT'?history.storage(DB,user,u.searchParams.get('budget')||'personal'):DB});
 const h=new Headers(r.headers);for(const [k,v]of Object.entries(headers))h.set(k,v);
 if(path==='/'&&r.ok){h.set('Content-Type','text/html; charset=utf-8');const html=(await r.text()).replace('<head>','<head><script>window.monthlyFlowStandalone=true;window.monthlyFlowAdmin='+JSON.stringify(admins.has(user.email))+';</script>');h.set('Content-Security-Policy',scriptReportPolicy(html));return new Response(html,{status:r.status,headers:h});}
 return new Response(r.body,{status:r.status,headers:h});
 };
 return Object.assign(handle,{tickGmail:gmail.tick});
}
