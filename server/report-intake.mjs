import {budgetAccess,serviceJSON,boundedJSON,serviceError} from './budget-access.mjs';
import {reportHash} from './report-crypto.mjs';
import {cashAccountList,creditCards} from '../dist/server/budget.js';
import {isVault} from '../dist/server/vault.js';

const maxSource=5*1024*1024,uuid=/^[a-f0-9-]{36}$/,hash=/^[a-f0-9]{64}$/;
async function sourceBytes(request){
 if(Number(request.headers.get('content-length'))>maxSource)throw serviceError('הדוח גדול מ־5 MB.',413);
 const reader=request.body?.getReader();if(!reader)throw serviceError('לא התקבל קובץ.');
 const parts=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxSource){await reader.cancel();throw serviceError('הדוח גדול מ־5 MB.',413)}parts.push(Buffer.from(value));}}finally{reader.releaseLock()}
 return Buffer.concat(parts,size);
}

/** Phase 1 transport and durable approval only. No parser, notices or financial
 * command is imported here. Identifiers are read on-device after approval. */
export function createReportIntake(db,{reportStore,origin,isAllowed,now=()=>Date.now(),onStored}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS report_intake_privacy(user_id TEXT PRIMARY KEY,consented_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS report_intake_connections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,label TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,last_attempt TEXT,last_success TEXT,last_error TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS report_intake_submissions(connection_id TEXT NOT NULL,report_id TEXT NOT NULL,PRIMARY KEY(connection_id,report_id));
 CREATE TABLE IF NOT EXISTS report_intake_approvals(intake_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_hash TEXT NOT NULL,approved_at TEXT NOT NULL,budget TEXT,kind TEXT,target TEXT,report_id TEXT,identity_key TEXT);
 CREATE TABLE IF NOT EXISTS report_intake_bindings(user_id TEXT NOT NULL,identity_key TEXT NOT NULL,kind TEXT NOT NULL,budget TEXT NOT NULL,target TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(user_id,identity_key));`);
 const stamp=()=>new Date(now()).toISOString(),scope=user=>'incoming:'+user.id;
 const authorize=user=>{const current=user&&db.prepare('SELECT email FROM auth_users WHERE id=?').get(user.id);if(!current||current.email!==user.email||!isAllowed(current.email))throw serviceError('הגישה לחשבון אינה מורשית.',403)};
 const consented=user=>!!db.prepare('SELECT 1 FROM report_intake_privacy WHERE user_id=?').get(user.id);
 const requireConsent=user=>{if(!consented(user))throw serviceError('יש לאשר שמירת דוחות בתיבה הפרטית שהשרת יכול לקרוא.',409)};
 const record=(user,id)=>db.prepare('SELECT id,source_hash,revision,state,source_bytes,created_at,original_removed_at FROM report_sources WHERE scope=? AND id=?').get(scope(user),id);
 const approval=(user,id)=>db.prepare('SELECT * FROM report_intake_approvals WHERE user_id=? AND intake_id=?').get(user.id,id);
 const receipt=(row,verified)=>row.original_removed_at!==null&&row.original_removed_at!==undefined?({receiptId:row.id,sourceHash:row.source_hash,stored:false,completed:true,completionAcknowledged:true,originalRemoved:true,processingState:'completed-original-removed',budgetState:'previously-recorded',revision:row.revision,cleanupEligible:false,fullImportComplete:false}):({receiptId:row.id,sourceHash:row.source_hash,stored:true,processingState:verified?'verified':'awaiting_verification',budgetState:'not-committed',revision:row.revision,cleanupEligible:false});
 const deliveryReceipt=(user,connection,row,{verifyStorage=false}={})=>{
  authorize(user);requireConsent(user);
  if(!db.prepare('SELECT 1 FROM report_intake_connections WHERE id=? AND user_id=? AND revoked=0').get(connection.id,user.id))throw serviceError('חיבור ההעלאה בוטל.',401);
  try{reportStore.lifecycle.ensureOriginal(scope(user),row.id);}catch(error){if(error.status!==410)throw error;}row=record(user,row.id);
  const approved=approval(user,row.id),result={...receipt(row,!!approved),connectionId:connection.id,fullImportComplete:false,deviceCleanupVersion:1,storageVerified:false,deviceCopyRemovable:false};
  // A fresh, connection-owned read-back proves storage independently of parsing
  // or financial completion. Catalog snapshots never authorize device deletion.
  if(verifyStorage&&row.original_removed_at===null){
   const source=reportStore.source(scope(user),row.id);
   if(!source||source.sourceHash!==row.source_hash||source.bytes.length!==row.source_bytes||reportHash(source.bytes)!==row.source_hash)throw serviceError('לא ניתן לאמת עותק שמור של המקור. הקובץ נשאר במכשיר.',503);
   Object.assign(result,{storageVerified:true,deviceCopyRemovable:true,originalRemoved:false,storageVerifiedAt:stamp()});
  }
  if(row.original_removed_at===null&&approved?.source_hash===row.source_hash&&approved.report_id)try{
   const access=budgetAccess(db,user,approved.budget,{isAllowed,write:true});
   if(reportStore.cleanupComplete(access,approved.report_id,row.source_hash,approved))Object.assign(result,{processingState:'imported',budgetState:'committed',fullImportComplete:true,cleanupEligible:true});
  }catch{/* Revoked/locked/inaccessible destinations never authorize cleanup. */}
  return result;
 };
 const snapshot=user=>{
  const rows=new Map(db.prepare('SELECT id,source_hash,source_bytes FROM report_sources WHERE scope=?').all(scope(user)).map(row=>[row.id,row]));
  return {accountId:user.id,accountEmail:user.email,intakeIdentityBound:true,storageConsented:consented(user),reports:reportStore.list(scope(user)).filter(row=>!row.originalRemoved).map(row=>{const raw=rows.get(row.id),a=approval(user,row.id);return {...row,sourceHash:raw.source_hash,size:raw.source_bytes,verificationState:a?.report_id?'routed':a?'verified':'awaiting_verification',approvedAt:a?.approved_at??null,route:a?.report_id?{budget:a.budget,kind:a.kind,target:a.target,reportId:a.report_id}:null}}),connections:db.prepare('SELECT id,label,revoked,last_attempt,last_success,last_error,created_at FROM report_intake_connections WHERE user_id=? ORDER BY created_at DESC').all(user.id),bindings:db.prepare('SELECT identity_key AS identityKey,kind,budget,target,revision FROM report_intake_bindings WHERE user_id=?').all(user.id)};
 };
 const bound=(request,user)=>{authorize(user);if(request.headers.get('x-budget-account-id')!==user.id)throw serviceError('החשבון השתנה. יש לפתוח מחדש את תיבת הסנכרון.',403)};
 const manage=async(request,user)=>{
  bound(request,user);const url=new URL(request.url),id=url.searchParams.get('id');
  if(request.method==='GET'){
   if(!id)return serviceJSON(snapshot(user));
   const row=record(user,id);if(!row)throw serviceError('המקור אינו זמין בתיבה הפרטית הזו.',404);
   const purpose=url.searchParams.get('purpose');
   if(!['original','parse'].includes(purpose))throw serviceError('יש לבחור הורדת מקור או פענוח.');
   if(purpose==='parse'&&!approval(user,id))throw serviceError('יש לאשר את הקובץ לפני פענוח.',409);
   const source=reportStore.source(scope(user),id);
   return new Response(source.bytes,{headers:{'Cache-Control':'no-store','Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(source.name),'x-source-hash':source.sourceHash}});
  }
  if(request.method==='PUT'){
   requireConsent(user);const bytes=await sourceBytes(request);let name;try{name=decodeURIComponent(request.headers.get('x-report-name')??'')}catch{throw serviceError('שם קובץ לא תקין.')}
   bound(request,user);const stored=reportStore.upload({scope:scope(user),plan:null},bytes,name),row=record(user,stored.receiptId);
   const result={...receipt(row,!!approval(user,row.id)),duplicate:!!stored.duplicate};
   if(stored.stored)try{await onStored?.(user,row.id);}catch{/* Source receipt remains durable. */}
   return serviceJSON({...receipt(record(user,row.id),!!approval(user,row.id)),duplicate:!!stored.duplicate},201);
  }
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  const input=await boundedJSON(request);bound(request,user);
  if(input.action==='consent'){
   if(input.confirmServerRead!==true)throw serviceError('יש לאשר שמירת דוחות שהשרת יכול לקרוא.');
   db.prepare('INSERT OR IGNORE INTO report_intake_privacy VALUES(?,?)').run(user.id,stamp());return serviceJSON({ok:true});
  }
  if(input.action==='connect'){
   requireConsent(user);
   if(!uuid.test(input.id??'')||typeof input.secret!=='string'||!/^[\w-]{43}$/.test(input.secret)||typeof input.label!=='string'||!input.label.trim()||input.label.length>60)throw serviceError('יש לבדוק שם ומפתח חיבור.');
   const prior=db.prepare('SELECT * FROM report_intake_connections WHERE id=?').get(input.id),tokenHash=reportHash(input.secret);
   if(prior){if(prior.user_id!==user.id||prior.token_hash!==tokenHash||prior.label!==input.label.trim()||prior.revoked)throw serviceError('החיבור השתנה. יש ליצור חיבור חדש.',409);return serviceJSON({id:prior.id,endpoint:origin+'/api/imports/incoming',recovered:true})}
   if(db.prepare('SELECT COUNT(*) n FROM report_intake_connections WHERE user_id=? AND revoked=0').get(user.id).n>=20)throw serviceError('יש לבטל חיבור קודם לפני יצירת חיבור נוסף.');
   reportStore.secret();db.prepare('INSERT INTO report_intake_connections(id,user_id,token_hash,label,created_at) VALUES(?,?,?,?,?)').run(input.id,user.id,tokenHash,input.label.trim(),stamp());return serviceJSON({id:input.id,endpoint:origin+'/api/imports/incoming'},201);
  }
  if(input.action==='revoke'){if(!uuid.test(input.id??''))throw serviceError('מזהה החיבור אינו תקין.');db.prepare('UPDATE report_intake_connections SET revoked=1 WHERE user_id=? AND id=?').run(user.id,input.id);return serviceJSON({ok:true})}
  if(input.action==='delete'){
   if(!uuid.test(input.id??'')||!hash.test(input.sourceHash??'')||!Number.isSafeInteger(input.revision)||input.revision<1||input.confirm!==true)throw serviceError('יש לאשר מחיקת עותק מהתיבה הפרטית.');
   const current=record(user,input.id);
   if(!current)return serviceJSON({deleted:true,id:input.id,recovered:true});
   if(current.original_removed_at!==null||current.source_hash!==input.sourceHash||current.revision!==input.revision)throw serviceError('המקור השתנה. יש לבדוק אותו מחדש לפני מחיקה.',409);
   // Only the actor's staging copy is removed. Budget sources, remembered
   // mappings, import receipts and financial records retain their own lifecycle.
   db.exec('BEGIN IMMEDIATE');try{
    db.prepare('DELETE FROM report_intake_submissions WHERE report_id=?').run(current.id);
    db.prepare('DELETE FROM report_intake_approvals WHERE intake_id=? AND user_id=?').run(current.id,user.id);
    db.prepare('DELETE FROM report_sources WHERE scope=? AND id=? AND revision=?').run(scope(user),current.id,current.revision);
    db.exec('COMMIT');return serviceJSON({deleted:true,id:current.id});
   }catch(error){db.exec('ROLLBACK');throw error}
  }
  const row=record(user,input.id);if(!row)throw serviceError('המקור אינו זמין בתיבה הפרטית הזו.',404);
  if(input.sourceHash!==row.source_hash||input.revision!==row.revision)throw serviceError('הקובץ השתנה. יש לפתוח אותו מחדש לפני האישור.',409);
  if(input.action==='approve'){
   if(input.confirm!==true||row.state!=='received')throw serviceError('יש לאשר את קובץ המקור לפני פענוח.',409);
   db.prepare('INSERT OR IGNORE INTO report_intake_approvals(intake_id,user_id,source_hash,approved_at) VALUES(?,?,?,?)').run(row.id,user.id,row.source_hash,stamp());return serviceJSON({approved:true,id:row.id,sourceHash:row.source_hash});
  }
  if(input.action==='route'){
   const approved=approval(user,row.id);if(!approved||approved.source_hash!==row.source_hash||input.confirm!==true)throw serviceError('חסר אישור פענוח לקובץ הזה.',409);
   if(!['bank','card'].includes(input.kind)||typeof input.budget!=='string'||!input.budget||typeof input.target!=='string'||!/^[-\w:]{1,100}$/.test(input.target)||typeof input.identityKey!=='string'||input.identityKey!==''&&!hash.test(input.identityKey))throw serviceError('יש לבחור חשבון יעד מזוהה.');
   const access=budgetAccess(db,user,input.budget,{isAllowed,write:true});
   if(!access.plan)throw serviceError('יש להגדיר חשבון בתקציב היעד לפני העברת הדוח.',409);
   if(!isVault(access.plan)&&!(input.kind==='bank'?cashAccountList(access.plan):creditCards(access.plan)).some(row=>row.id===input.target))throw serviceError('חשבון היעד השתנה. יש לבדוק את השיוך.',409);
   if(approved.report_id){if(approved.budget!==input.budget||approved.kind!==input.kind||approved.target!==input.target||approved.identity_key!==input.identityKey)throw serviceError('המקור כבר הועבר ליעד אחר.',409);const existing=reportStore.source(access.scope,approved.report_id);if(!existing)throw serviceError('המקור ביעד הוסר. המקור הפרטי נשמר וזמין להורדה.',409);return serviceJSON({routed:true,reportId:approved.report_id,budget:approved.budget,kind:approved.kind,target:approved.target,recovered:true})}
   if(!Number.isSafeInteger(input.budgetRevision)||input.budgetRevision!==access.revision)throw serviceError('תקציב היעד השתנה. יש לסגור את השיוך ולפתוח את הדוח מחדש.',409);
   db.exec('BEGIN IMMEDIATE');try{
    const binding=input.identityKey?db.prepare('SELECT * FROM report_intake_bindings WHERE user_id=? AND identity_key=?').get(user.id,input.identityKey):null;
    if(input.automatic===true&&(!binding||binding.budget!==input.budget||binding.kind!==input.kind||binding.target!==input.target||binding.revision!==input.bindingRevision))throw serviceError('השיוך האוטומטי השתנה. יש לבדוק את היעד מחדש.',409);
    if(input.remember===true&&(!input.identityKey||input.bindingRevision!==(binding?.revision??0)))throw serviceError('שיוך החשבון השתנה במכשיר אחר. יש לרענן לפני שמירת השיוך.',409);
    const source=reportStore.source(scope(user),row.id),stored=reportStore.upload(budgetAccess(db,user,input.budget,{isAllowed,write:true}),source.bytes,source.name);
    const updated=db.prepare('UPDATE report_intake_approvals SET budget=?,kind=?,target=?,report_id=?,identity_key=? WHERE intake_id=? AND user_id=? AND report_id IS NULL').run(input.budget,input.kind,input.target,stored.receiptId,input.identityKey,row.id,user.id);
    if(!updated.changes)throw serviceError('הקובץ הועבר בינתיים. יש לרענן את התיבה.',409);
    if(input.remember===true)db.prepare('INSERT INTO report_intake_bindings VALUES(?,?,?,?,?,1) ON CONFLICT(user_id,identity_key) DO UPDATE SET kind=excluded.kind,budget=excluded.budget,target=excluded.target,revision=report_intake_bindings.revision+1').run(user.id,input.identityKey,input.kind,input.budget,input.target);
    db.exec('COMMIT');return serviceJSON({routed:true,reportId:stored.receiptId,budget:input.budget,kind:input.kind,target:input.target});
   }catch(error){db.exec('ROLLBACK');throw error}
  }
  throw serviceError('הפעולה אינה נתמכת.');
 };
 const receive=async request=>{
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)throw serviceError('מקור הבקשה אינו תקין.',403);
  const token=request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1],connection=token?db.prepare('SELECT * FROM report_intake_connections WHERE token_hash=? AND revoked=0').get(reportHash(token)):null;
  if(!connection)throw serviceError('חיבור ההעלאה אינו תקין או בוטל.',401);
  const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(connection.user_id);authorize(user);requireConsent(user);
  db.prepare('DELETE FROM report_limits WHERE expires<=?').run(now());db.prepare('INSERT INTO report_limits VALUES(?,1,?) ON CONFLICT(connection_id) DO UPDATE SET count=count+1').run(connection.id,now()+3600000);
  if(db.prepare('SELECT count FROM report_limits WHERE connection_id=?').get(connection.id).count>100)throw serviceError('יותר מדי בקשות. נסו מאוחר יותר.',429);
  const url=new URL(request.url);
  if(request.method==='GET'){
   if(['1','2'].includes(url.searchParams.get('catalog'))){
    const rows=db.prepare('SELECT r.id,r.source_hash,r.revision FROM report_sources r JOIN report_intake_submissions s ON s.report_id=r.id WHERE r.scope=? AND s.connection_id=? LIMIT 500').all(scope(user),connection.id);
    return serviceJSON({version:new URL(request.url).searchParams.get('catalog')==='2'?2:1,...(url.searchParams.get('catalog')==='2'?{connectionId:connection.id}:{}),receipts:Object.fromEntries(rows.map(row=>[row.source_hash,deliveryReceipt(user,connection,row)]))});
   }
   const receiptId=url.searchParams.get('receipt'),sourceHash=url.searchParams.get('hash');
   if(!receiptId&&!sourceHash)throw serviceError('יש לבחור קבלה או חתימת מקור.',400);
   const row=db.prepare("SELECT r.id,r.source_hash,r.revision FROM report_sources r JOIN report_intake_submissions s ON s.report_id=r.id WHERE r.scope=? AND s.connection_id=? AND (?='' OR r.id=?) AND (?='' OR r.source_hash=?)").get(scope(user),connection.id,receiptId??'',receiptId??'',sourceHash??'',hash.test(sourceHash??'')?sourceHash:'invalid');
   if(!row)throw serviceError('קבלת ההעלאה אינה זמינה לחיבור הזה.',404);
   const verifyStorage=url.searchParams.get('verifyStorage')==='1';
   if(verifyStorage&&(!uuid.test(receiptId??'')||!hash.test(sourceHash??'')))throw serviceError('לאימות שמירה נדרשים מזהה קבלה וחתימת מקור מדויקים.',400);
   return serviceJSON(deliveryReceipt(user,connection,row,{verifyStorage}));
  }
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  db.prepare('UPDATE report_intake_connections SET last_attempt=? WHERE id=?').run(stamp(),connection.id);
  try{
   const bytes=await sourceBytes(request);authorize(user);
   if(!db.prepare('SELECT 1 FROM report_intake_connections WHERE id=? AND revoked=0').get(connection.id))throw serviceError('חיבור ההעלאה בוטל.',401);
   // A durable source, its token-local receipt and success status are one write.
   // A failed receipt write must not consume quota with an unreachable upload.
   db.exec('BEGIN IMMEDIATE');try{
    const stored=reportStore.upload({scope:scope(user),plan:null},bytes,url.searchParams.get('name')??'');
    db.prepare('INSERT OR IGNORE INTO report_intake_submissions VALUES(?,?)').run(connection.id,stored.receiptId);
    db.prepare('UPDATE report_intake_connections SET last_success=?,last_error=NULL WHERE id=?').run(stamp(),connection.id);
    const row=record(user,stored.receiptId),result={...deliveryReceipt(user,connection,row),duplicate:!!stored.duplicate};
    db.exec('COMMIT');if(stored.stored)try{await onStored?.(user,row.id);}catch{/* Delivery remains durable even if preparation is unavailable. */}return serviceJSON({...deliveryReceipt(user,connection,record(user,row.id)),duplicate:!!stored.duplicate},201);
   }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error}
  }catch(error){db.prepare('UPDATE report_intake_connections SET last_error=? WHERE id=?').run(error.safeToExpose?error.message:'העלאת הדוח לא אושרה. יש לנסות שוב.',connection.id);throw error}
 };
 const safe=fn=>async(...args)=>{try{return await fn(...args)}catch(error){return serviceJSON({error:error.safeToExpose?error.message:'תיבת הסנכרון אינה זמינה כרגע. המקור נשמר במכשיר.'},error.safeToExpose?error.status:503)}};
 const pending=user=>db.prepare('SELECT COUNT(*) AS count,MAX(r.created_at) AS latest FROM report_sources r LEFT JOIN report_intake_approvals a ON a.intake_id=r.id WHERE r.scope=? AND a.report_id IS NULL').get(scope(user));
 return {handle:safe(manage),receive:safe(receive),snapshot,pending};
}
