import {normalizeWalletText} from '../dist/server/wallet-text-model.js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {creditCards} from '../dist/server/budget.js';
import {isVault} from '../dist/server/vault.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const clean=normalizeWalletText;
const monthOk=m=>typeof m==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createApplePay(db,{origin,now=()=>Date.now(),isAllowed=()=>false}){
 db.exec(`CREATE TABLE IF NOT EXISTS wallet_state(scope TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS wallet_connections(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL,budget_id TEXT NOT NULL,scope TEXT NOT NULL,card_id TEXT NOT NULL,label TEXT NOT NULL,created_at TEXT NOT NULL,last_success TEXT,revoked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS wallet_events(id TEXT PRIMARY KEY,scope TEXT NOT NULL,user_id TEXT NOT NULL,event_id TEXT NOT NULL,payload_hash TEXT NOT NULL,card_id TEXT NOT NULL,merchant TEXT NOT NULL,cents INTEGER NOT NULL,currency TEXT NOT NULL,occurred_at TEXT NOT NULL,time_source TEXT NOT NULL,received_at TEXT NOT NULL,billing_month TEXT NOT NULL,state TEXT NOT NULL,kind TEXT NOT NULL,UNIQUE(scope,user_id,event_id));
 CREATE INDEX IF NOT EXISTS wallet_events_month ON wallet_events(scope,billing_month);
 CREATE TABLE IF NOT EXISTS wallet_merchant_categories(scope TEXT NOT NULL,merchant TEXT NOT NULL,category TEXT NOT NULL,PRIMARY KEY(scope,merchant));
 CREATE TABLE IF NOT EXISTS wallet_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 const access=(user,budget)=>{
  if(!user||!isAllowed(user.email))throw fail('הגישה לחשבון אינה מורשית.',403);
  if(budget==='personal'){const row=db.prepare('SELECT data FROM plans WHERE user_id=?').get(user.id);return{scope:'personal:'+user.id,plan:row?.data?JSON.parse(row.data):null};}
  const row=db.prepare('SELECT b.data FROM budgets b WHERE b.id=? AND (b.owner_id=? OR EXISTS(SELECT 1 FROM budget_members m WHERE m.budget_id=b.id AND m.user_id=? AND NOT EXISTS(SELECT 1 FROM budget_member_roles r WHERE r.budget_id=m.budget_id AND r.user_id=m.user_id AND r.role=\'viewer\')))').get(budget,user.id,user.id);
  if(!row)throw fail('התקציב אינו זמין לחשבון הזה.',403);return{scope:'budget:'+budget,plan:row.data?JSON.parse(row.data):null};
 };
 const revision=scope=>db.prepare('SELECT revision FROM wallet_state WHERE scope=?').get(scope)?.revision??0;
 const advance=scope=>db.prepare('INSERT INTO wallet_state VALUES(?,1) ON CONFLICT(scope) DO UPDATE SET revision=revision+1').run(scope);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 const body=async(request,max=4096)=>{const text=await request.text();if(Buffer.byteLength(text)>max)throw fail('הבקשה גדולה מדי.',413);try{return JSON.parse(text)}catch{throw fail('יש לשלוח נתוני JSON תקינים.');}};
 const receive=async request=>{
  if(request.method!=='POST')throw fail('הפעולה אינה נתמכת.',405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)throw fail('מקור הבקשה אינו תקין.',403);
  const bearer=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const connection=bearer?db.prepare('SELECT * FROM wallet_connections WHERE hash=? AND revoked=0').get(hash(bearer)):null;
  if(!connection)throw fail('אסימון החיבור אינו תקין או בוטל.',401);
  const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(connection.user_id);access(user,connection.budget_id);
  db.prepare('DELETE FROM wallet_limits WHERE expires<=?').run(now());
  const key=connection.id;db.prepare('INSERT INTO wallet_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now()+3600000);
  if(db.prepare('SELECT count FROM wallet_limits WHERE key=?').get(key).count>120)throw fail('יותר מדי שליחות. נסו שוב מאוחר יותר.',429);
  const input=await body(request);if(!input||typeof input!=='object'||Array.isArray(input))throw fail('נתוני העסקה אינם תקינים.');
  if(Object.keys(input).some(k=>!['eventId','merchant','amount','currency','occurredAt','kind'].includes(k)))throw fail('שדה לא נתמך בעסקה.');
  if(typeof input.eventId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(input.eventId))throw fail('יש לצרף eventId קבוע לכל עסקה.');
  const merchant=clean(input.merchant,160),amount=typeof input.amount==='number'?input.amount:typeof input.amount==='string'&&/^\d+(?:\.\d{1,2})?$/.test(input.amount)?Number(input.amount):NaN;
  if(!merchant||!Number.isFinite(amount)||amount<=0||amount>1000000||Math.abs(Math.round(amount*100)-amount*100)>1e-6||typeof input.currency!=='string'||! /^[A-Z]{3}$/.test(input.currency)||input.kind!==undefined&&!['purchase','refund'].includes(input.kind))throw fail('יש לבדוק בית עסק, סכום, מטבע וסוג עסקה.');
  const timeSource=input.occurredAt===undefined?'received':'wallet',timestamp=timeSource==='received'?now():typeof input.occurredAt==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt)?Date.parse(input.occurredAt):NaN;
  if(timeSource==='wallet'&&(typeof input.occurredAt!=='string'||(!Number.isFinite(Date.parse(input.occurredAt.slice(0,10)+'T00:00:00Z'))||new Date(input.occurredAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==input.occurredAt.slice(0,10))))throw fail('תאריך העסקה אינו תקין.');
  if(!Number.isFinite(timestamp)||timestamp<Date.parse('2000-01-01')||timestamp>now()+300000)throw fail('זמן העסקה אינו תקין.');
  const occurred=new Date(timestamp).toISOString(),received=new Date(now()).toISOString(),month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).format(new Date(timestamp));
  const payloadHash=hash(JSON.stringify([connection.card_id,merchant,Math.round(amount*100),input.currency,input.occurredAt??null,input.kind??'purchase']));
  return transaction(()=>{
   if(!db.prepare('SELECT id FROM wallet_connections WHERE id=? AND revoked=0').get(connection.id))throw fail('אסימון החיבור בוטל.',401);access(db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(user.id),connection.budget_id);
   const existing=db.prepare('SELECT id,payload_hash FROM wallet_events WHERE scope=? AND user_id=? AND event_id=?').get(connection.scope,user.id,input.eventId);
   if(existing){if(existing.payload_hash!==payloadHash)throw fail('מזהה העסקה כבר שימש לנתונים אחרים.',409);return json({ok:true,duplicate:true,id:existing.id});}
   if(db.prepare('SELECT COUNT(*) AS n FROM wallet_events WHERE scope=?').get(connection.scope).n>=20000)throw fail('תיבת הייבוא מלאה. יש לפנות למנהל האפליקציה.',429);
   const duplicate=db.prepare('SELECT id FROM wallet_events WHERE scope=? AND card_id=? AND merchant=? AND cents=? AND currency=? AND kind=? AND ABS(julianday(occurred_at)-julianday(?))*86400<120 AND state!=?').get(connection.scope,connection.card_id,merchant,Math.round(amount*100),input.currency,input.kind??'purchase',occurred,'ignored');
   const id=randomUUID();db.prepare('INSERT INTO wallet_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,connection.scope,user.id,input.eventId,payloadHash,connection.card_id,merchant,Math.round(amount*100),input.currency,occurred,timeSource,received,month,duplicate?'duplicate':'pending',input.kind??'purchase');
   db.prepare('UPDATE wallet_connections SET last_success=? WHERE id=?').run(received,connection.id);advance(connection.scope);
   return json({ok:true,id,reviewRequired:true,suspectedDuplicate:!!duplicate},201);
  });
 };
 const merchants=scope=>db.prepare(`SELECT DISTINCT e.merchant,COALESCE(c.category,'') AS category FROM wallet_events e LEFT JOIN wallet_merchant_categories c ON c.scope=e.scope AND c.merchant=e.merchant WHERE e.scope=? ORDER BY e.merchant LIMIT 1001`).all(scope).map(m=>({...m,id:hash(m.merchant),location:''}));
 const manage=async(request,user)=>{
  if(request.headers.has('x-budget-account-id')&&request.headers.get('x-budget-account-id')!==user?.id)throw fail('החשבון השתנה. יש לפתוח את הדוח מחדש.',403);
  if(!['GET','POST'].includes(request.method))throw fail('הפעולה אינה נתמכת.',405);
  const url=new URL(request.url),budget=url.searchParams.get('budget')??'personal';let {scope,plan}=access(user,budget);const identity={accountId:user.id,accountEmail:user.email,budgetId:budget,walletIdentityBound:true},reply=(data,status=200)=>json({...identity,...data},status);
  if(request.method==='GET'){
   if(url.searchParams.get('merchants')==='1'){const rows=merchants(scope);if(rows.length>1000)throw fail('יותר מ־1,000 בתי עסק. יש לפנות למנהל לפני ייצוא.',413);return reply({revision:revision(scope),merchants:rows,identityBound:true});}
   const month=url.searchParams.get('month')??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).format(new Date(now()));if(!monthOk(month))throw fail('חודש הייבוא אינו תקין.');
   const events=db.prepare('SELECT e.id,e.card_id,e.merchant,e.cents,e.currency,e.occurred_at,e.time_source,e.received_at,e.billing_month,e.state,e.kind,c.category FROM wallet_events e LEFT JOIN wallet_merchant_categories c ON c.scope=e.scope AND c.merchant=e.merchant WHERE e.scope=? AND e.billing_month=? ORDER BY e.occurred_at DESC LIMIT 1000').all(scope,month);
   const connections=db.prepare('SELECT id,card_id,label,created_at,last_success,revoked FROM wallet_connections WHERE scope=? AND user_id=? ORDER BY created_at DESC').all(scope,user.id);
   const months=db.prepare('SELECT billing_month AS month,COUNT(*) AS count FROM wallet_events WHERE scope=? GROUP BY billing_month ORDER BY billing_month DESC').all(scope);
   const truncated=(months.find(r=>r.month===month)?.count??0)>events.length;return reply({revision:revision(scope),month,events,connections,months,truncated,endpoint:origin+'/api/imports/apple-pay',encrypted:isVault(plan)});
  }
  const input=await body(request,300000);if(!input||!Number.isSafeInteger(input.revision)||input.revision<0)throw fail('יש לרענן את נתוני הייבוא.');
  return transaction(()=>{
   plan=access(db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(user.id),budget).plan;
   if(input.revision!==revision(scope))throw fail('הייבוא השתנה. רעננו לפני אישור נוסף.',409);
   if(input.action==='merchant-categories'){
    if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>1000)throw fail('יש לבחור המלצות לבדיקה.');
    const known=new Map(merchants(scope).map(m=>[m.id,m])),seen=new Set();
    for(const row of input.rows){const m=known.get(row?.id);if(!m||seen.has(row.id)||row.merchant!==m.merchant||row.location!==''||row.previousCategory!==m.category||typeof row.recommendedCategory!=='string'||!row.recommendedCategory.trim()||row.recommendedCategory.length>60||clean(row.recommendedCategory,60)!==row.recommendedCategory)throw fail('המלצה שונתה או אינה תקינה. רעננו וייבאו מחדש.');seen.add(row.id);}
    for(const row of input.rows)db.prepare('INSERT INTO wallet_merchant_categories VALUES(?,?,?) ON CONFLICT(scope,merchant) DO UPDATE SET category=excluded.category').run(scope,row.merchant,row.recommendedCategory);
    advance(scope);return reply({ok:true,revision:revision(scope)});
   }
   if(input.action==='connect'){
    if(!plan)throw fail('יש לשמור את התקציב תחילה.');
    if(input.confirmStorage!==true)throw fail('יש לאשר שמירה של נתוני הייבוא בנפרד מהתקציב.');
    const cards=isVault(plan)?[]:creditCards(plan),card=cards.find(c=>c.id===input.cardId);
    if(!/^card(?:[12]|_[a-zA-Z0-9-]{1,70})$/.test(input.cardId??'')||!isVault(plan)&&(!card||card.removedFrom))throw fail('יש לבחור כרטיס פעיל שנשמר בתקציב.');
    if(db.prepare('SELECT COUNT(*) AS n FROM wallet_connections WHERE user_id=? AND revoked=0').get(user.id).n>=20)throw fail('יש לבטל חיבור קודם לפני יצירת חיבור נוסף.');
    const secret=randomBytes(32).toString('base64url'),id=randomUUID(),label=clean(input.label,60);if(!label)throw fail('יש לתת שם לחיבור.');
    db.prepare('INSERT INTO wallet_connections VALUES(?,?,?,?,?,?,?,?,NULL,0)').run(id,hash(secret),user.id,budget,scope,input.cardId,label,new Date(now()).toISOString());advance(scope);
    return reply({id,secret,revision:revision(scope)},201);
   }
   if(input.action==='revoke'){
    const result=db.prepare('UPDATE wallet_connections SET revoked=1 WHERE id=? AND user_id=? AND scope=? AND revoked=0').run(input.id,user.id,scope);if(!result.changes)throw fail('החיבור אינו זמין.',404);
   }else if(input.action==='review'){
    if(!['included','ignored'].includes(input.state)||!monthOk(input.month))throw fail('יש לבחור חודש חיוב ואופן הכללה.');
    const event=db.prepare('SELECT * FROM wallet_events WHERE id=? AND scope=?').get(input.id,scope);if(!event)throw fail('העסקה אינה זמינה.',404);if(input.state==='included'&&event.currency!=='ILS')throw fail('עסקה במטבע זר דורשת סכום חיוב בשקלים ממקור הכרטיס. אין המרה אוטומטית.');
    db.prepare('UPDATE wallet_events SET state=?,billing_month=? WHERE id=? AND scope=?').run(input.state,input.month,input.id,scope);
   }else if(input.action==='approve-month'){
    if(!monthOk(input.month)||typeof input.cardId!=='string')throw fail('יש לבחור חודש וכרטיס.');
    db.prepare("UPDATE wallet_events SET state='included' WHERE scope=? AND billing_month=? AND card_id=? AND state='pending' AND currency='ILS'").run(scope,input.month,input.cardId);
   }else throw fail('הפעולה אינה נתמכת.');advance(scope);return reply({ok:true,revision:revision(scope)});
  });
 };
 return async(request,user)=>{try{return new URL(request.url).pathname==='/api/imports/apple-pay'?await receive(request):await manage(request,user);}catch(error){return json({error:error.status?error.message:'הייבוא לא נשמר. נסו שוב.'},error.status??503);}};
}
