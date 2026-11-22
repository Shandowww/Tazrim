import {randomBytes} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {boundedJSON,serviceError,serviceJSON} from './budget-access.mjs';
import {reportHash,sealReport,openReport} from './report-crypto.mjs';
import {parsePurchaseNoteSheet,purchaseNoteSource} from '../dist/server/purchase-notes-model.js';

export const purchaseNotesScope='https://www.googleapis.com/auth/spreadsheets.readonly';
export function createPurchaseNotes(db,{origin,clientId,clientSecret,isAllowed,secret,now=()=>Date.now(),oauthFactory=()=>new OAuth2Client(clientId,clientSecret,origin+'/auth/google/callback')}){
 db.exec(`CREATE TABLE IF NOT EXISTS purchase_note_connections(user_id TEXT PRIMARY KEY,data BLOB NOT NULL,revision INTEGER NOT NULL,last_checked INTEGER,last_success INTEGER,error TEXT,last_operation_id TEXT,last_operation_hash TEXT);
 CREATE TABLE IF NOT EXISTS purchase_note_pending(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,data BLOB NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS purchase_note_records(user_id TEXT NOT NULL,source_key TEXT NOT NULL,sheet_hash TEXT NOT NULL,data BLOB NOT NULL,source_hash TEXT NOT NULL,revision INTEGER NOT NULL,done INTEGER NOT NULL DEFAULT 0,present INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(user_id,source_key));`);
 const columns=new Set(db.prepare('PRAGMA table_info(purchase_note_connections)').all().map(column=>column.name));for(const name of ['last_operation_id','last_operation_hash'])if(!columns.has(name))db.exec('ALTER TABLE purchase_note_connections ADD COLUMN '+name+' TEXT');
 const seal=(value,aad)=>sealReport(secret(),Buffer.from(JSON.stringify(value)),aad),open=(bytes,aad)=>JSON.parse(openReport(secret(),bytes,aad));
 const aad=user=>'purchase-notes|'+user,row=user=>db.prepare('SELECT * FROM purchase_note_connections WHERE user_id=?').get(user),read=r=>r?open(r.data,aad(r.user_id)):{};
 const allowed=user=>{if(!user||!isAllowed(user.email.toLowerCase())||db.prepare('SELECT email FROM auth_users WHERE id=?').get(user.id)?.email.toLowerCase()!==user.email.toLowerCase())throw serviceError('החשבון או הגישה לפתקים השתנו. יש להתחבר מחדש.',403);};
 const current=(user,revision)=>{allowed(user);const r=row(user.id);if((r?.revision??0)!==revision)throw serviceError('חיבור הפתקים השתנה במכשיר אחר. רעננו לפני ניסיון נוסף.',409);return r;};
 const snapshot=user=>{
  allowed(user);const r=row(user.id),data=read(r),sheetHash=data.source?reportHash(data.source.spreadsheetId):null;
  const notes=sheetHash?db.prepare('SELECT * FROM purchase_note_records WHERE user_id=? AND sheet_hash=? ORDER BY rowid DESC').all(user.id,sheetHash).map(note=>({...open(note.data,aad(user.id)+'|note|'+note.source_key),key:note.source_key,revision:note.revision,done:!!note.done,present:!!note.present})):[];
  return{accountId:user.id,accountEmail:user.email,purchaseNotesIdentityBound:true,oauthConfigured:!!(clientId&&clientSecret),connected:!!data.tokens,revision:r?.revision??0,source:data.source??null,notes,lastChecked:r?.last_checked??null,lastSuccess:r?.last_success??null,error:r?.error??null,lastOperation:r?.last_operation_id??null};
 };
 const update=(user,previous,data,extra={})=>{
  current(user,previous?.revision??0);const {lastOperation,...content}=data;
  // Retry markers and successful no-change reads are operational; they must not
  // trigger a fresh financial backup by rewriting unchanged credentials.
  const bytes=previous&&JSON.stringify(read(previous))===JSON.stringify(content)?previous.data:seal(content,aad(user.id));
  if(previous)db.prepare('UPDATE purchase_note_connections SET data=?,revision=revision+1,last_checked=?,last_success=?,error=?,last_operation_id=?,last_operation_hash=? WHERE user_id=? AND revision=?').run(bytes,Object.hasOwn(extra,'lastChecked')?extra.lastChecked:previous.last_checked,Object.hasOwn(extra,'lastSuccess')?extra.lastSuccess:previous.last_success,extra.error??null,lastOperation?.id??null,lastOperation?.hash??null,user.id,previous.revision);
  else db.prepare('INSERT INTO purchase_note_connections(user_id,data,revision,last_operation_id,last_operation_hash) VALUES(?,?,1,?,?)').run(user.id,bytes,lastOperation?.id??null,lastOperation?.hash??null);
 };
 const begin=async(request,user)=>{
  allowed(user);const query=new URL(request.url).searchParams;
  if(query.get('accountId')!==user.id)throw serviceError('החשבון השתנה. יש לרענן.',403);
  const revision=Number(query.get('revision'));if(!query.has('revision')||!Number.isSafeInteger(revision)||revision<0)throw serviceError('גרסת החיבור אינה תקינה.');
  const r=current(user,revision);if(!read(r).source)throw serviceError('שמרו תחילה קישור לגיליון.');
  if(!clientId||!clientSecret)throw serviceError('חיבור Google אינו מוגדר.',503);
  const oauth=oauthFactory(),pkce=await oauth.generateCodeVerifierAsync(),state='pno.'+randomBytes(32).toString('base64url'),nonce=randomBytes(24).toString('base64url');current(user,revision);
  db.prepare('DELETE FROM purchase_note_pending WHERE expires<=?').run(now());
  const selected=new URLSearchParams((query.get('returnQuery')??'').slice(0,512)),returnQuery=new URLSearchParams();for(const name of ['budget','year','month'])if(selected.has(name)&&selected.get(name).length<=120)returnQuery.set(name,selected.get(name));
  db.prepare('INSERT INTO purchase_note_pending VALUES(?,?,?,?)').run(reportHash(state),user.id,seal({nonce,verifier:pkce.codeVerifier,revision,returnQuery:returnQuery.toString()},aad(user.id)+'|pending'),now()+600000);
  return new Response(null,{status:303,headers:{Location:oauth.generateAuthUrl({scope:['openid','email',purchaseNotesScope],state,nonce,access_type:'offline',prompt:'consent',code_challenge:pkce.codeChallenge,code_challenge_method:'S256',login_hint:user.email}),'Cache-Control':'no-store'}});
 };
 const callback=async(request,user)=>{
  allowed(user);const query=new URL(request.url).searchParams,pending=db.prepare('DELETE FROM purchase_note_pending WHERE hash=? AND user_id=? AND expires>? RETURNING *').get(reportHash(query.get('state')??''),user.id,now());
  if(!pending)throw serviceError('בקשת החיבור פגה. התחילו מחדש.');
  let status='failed',returnQuery='';
  try{
   const data=open(pending.data,aad(user.id)+'|pending'),oauth=oauthFactory();returnQuery=data.returnQuery??'';current(user,data.revision);
   if(!query.get('code')||query.has('error'))throw Error('OAuth cancelled');
   const {tokens}=await oauth.getToken({code:query.get('code'),codeVerifier:data.verifier}),ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId}),identity=ticket.getPayload();
   if(identity?.email_verified!==true||identity.email?.toLowerCase()!==user.email.toLowerCase()||identity.nonce!==data.nonce||!tokens.scope?.split(' ').includes(purchaseNotesScope))throw Error('Identity or read scope mismatch');
   const r=current(user,data.revision),old=read(r),refresh=tokens.refresh_token??old.tokens?.refresh_token;if(!refresh)throw Error('Offline access missing');
   update(user,r,{...old,tokens:{refresh_token:refresh},lastOperation:null});status='connected';
  }catch{/* Never expose provider messages or credentials in a redirect. */}
  const destination=new URLSearchParams(returnQuery);destination.set('sheets',status);return new Response(null,{status:303,headers:{Location:'/next/settings/purchase-notes?'+destination.toString(),'Cache-Control':'no-store'}});
 };
 const providerError=error=>{
  const response=error?.response,reason=response?.data?.error?.details??[];
  if(reason.some(value=>value.reason==='SERVICE_DISABLED'))return 'יש להפעיל Google Sheets API בפרויקט Google Cloud של Budgit ולנסות שוב.';
  if(response?.status===401||response?.data?.error==='invalid_grant')return 'הרשאת Google פגה או בוטלה. חברו מחדש את Google Sheets.';
  if(response?.status===403||response?.status===404)return 'אין גישה לגיליון. בדקו את הקישור ואת הרשאות חשבון Google המחובר.';
  if(response?.status===400)return 'הלשונית או טווח הקריאה אינם זמינים. בדקו את שם הלשונית בגיליון.';
  return 'לא ניתן לעדכן את הפתקים כרגע. בדקו חיבור והרשאות ונסו שוב.';
 };
 const inFlight=new Set();
 const handle=async(request,user)=>{
  allowed(user);const query=new URL(request.url).searchParams;
  if(query.get('accountId')!==user.id)throw serviceError('החשבון השתנה. יש לרענן.',403);
  if(request.method==='GET')return serviceJSON(snapshot(user));
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  const input=await boundedJSON(request);allowed(user);
  if(input?.accountId!==user.id||input.requireAccountId!==true)throw serviceError('הפעולה אינה שייכת לחשבון המחובר.',403);
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.operationId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.operationId))throw serviceError('פרטי הפעולה אינם תקינים.');
  const r=row(user.id),data=read(r),hash=reportHash(JSON.stringify(input));
  if(r?.last_operation_id===input.operationId){if(r.last_operation_hash!==hash)throw serviceError('אותו מזהה פעולה שימש לבחירה אחרת.',409);return serviceJSON({...snapshot(user),recovered:true});}
  current(user,input.expectedRevision);
  const next={...data,lastOperation:{id:input.operationId,hash}};
  if(input.action==='configure'){
   try{next.source=purchaseNoteSource(input.url,input.tab);}catch(error){throw serviceError(error.message);}
   if(data.source&&JSON.stringify(data.source)!==JSON.stringify(next.source)&&input.confirmChange!==true)throw serviceError('החלפת הגיליון דורשת אישור מפורש. הפתקים הקודמים יישמרו.',409);
   update(user,r,next,{lastSuccess:JSON.stringify(data.source)===JSON.stringify(next.source)?r?.last_success:null});
  }else if(input.action==='disconnect'){
   delete next.tokens;update(user,r,next);db.prepare('DELETE FROM purchase_note_pending WHERE user_id=?').run(user.id);
  }else if(input.action==='note-state'){
   if(typeof input.done!=='boolean'||!Number.isSafeInteger(input.noteRevision)||typeof input.key!=='string'||!/^[a-f0-9]{64}$/.test(input.key))throw serviceError('מצב הפתק אינו תקין.');
   const note=db.prepare('SELECT * FROM purchase_note_records WHERE user_id=? AND source_key=?').get(user.id,input.key);
   if(!note||note.revision!==input.noteRevision)throw serviceError('הפתק השתנה. רעננו לפני שינוי נוסף.',409);
   db.exec('BEGIN IMMEDIATE');try{current(user,input.expectedRevision);db.prepare('UPDATE purchase_note_records SET done=?,revision=revision+1 WHERE user_id=? AND source_key=? AND revision=?').run(Number(input.done),user.id,input.key,input.noteRevision);update(user,r,next);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }else if(input.action==='sync'){
   if(!data.tokens||!data.source)throw serviceError('חברו תחילה גיליון Google פרטי.');
   if(inFlight.has(user.id))throw serviceError('עדכון הפתקים כבר מתבצע. נסו שוב בעוד רגע.',409);
   inFlight.add(user.id);
   try{
    const oauth=oauthFactory();oauth.setCredentials(data.tokens);
    const range="'"+data.source.tab.replaceAll("'","''")+"'!A1:J10002",url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(data.source.spreadsheetId)+'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
    let response;try{response=await oauth.request({url,method:'GET',timeout:20000,retry:false,maxContentLength:3000000,maxBodyLength:3000000});}catch(error){throw serviceError(providerError(error),503);}
    let notes;try{notes=parsePurchaseNoteSheet(response.data?.values);}catch(error){throw serviceError(error.message,422);}
    current(user,input.expectedRevision);
    const sheetHash=reportHash(data.source.spreadsheetId),previous=db.prepare('SELECT * FROM purchase_note_records WHERE user_id=? AND sheet_hash=?').all(user.id,sheetHash),old=new Map(previous.map(note=>[note.source_key,note]));
    if(db.prepare('SELECT COUNT(*) AS n FROM purchase_note_records WHERE user_id=?').get(user.id).n+notes.filter(note=>!old.has(reportHash(data.source.spreadsheetId+'|'+note.id))).length>20000)throw serviceError('רשימת הפתקים מלאה. יש לייצא ולטפל בה לפני הוספת פתקים.',413);
    db.exec('BEGIN IMMEDIATE');
    try{
     current(user,input.expectedRevision);const present=new Set();
     for(const note of notes){
      const key=reportHash(data.source.spreadsheetId+'|'+note.id),sourceHash=reportHash(JSON.stringify(note)),prior=old.get(key);present.add(key);
      if(!prior)db.prepare('INSERT INTO purchase_note_records(user_id,source_key,sheet_hash,data,source_hash,revision) VALUES(?,?,?,?,?,1)').run(user.id,key,sheetHash,seal(note,aad(user.id)+'|note|'+key),sourceHash);
      else if(prior.source_hash!==sourceHash||!prior.present)db.prepare('UPDATE purchase_note_records SET data=?,source_hash=?,revision=revision+1,done=CASE WHEN source_hash<>? THEN 0 ELSE done END,present=1 WHERE user_id=? AND source_key=?').run(seal(note,aad(user.id)+'|note|'+key),sourceHash,sourceHash,user.id,key);
     }
     for(const prior of previous)if(prior.present&&!present.has(prior.source_key))db.prepare('UPDATE purchase_note_records SET present=0,revision=revision+1 WHERE user_id=? AND source_key=?').run(user.id,prior.source_key);
     update(user,r,next,{lastChecked:now(),lastSuccess:now()});db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
   }catch(error){
    // A failed or stale read never erases the last usable notes.
    allowed(user);if((row(user.id)?.revision??0)===input.expectedRevision)db.prepare('UPDATE purchase_note_connections SET last_checked=?,error=? WHERE user_id=? AND revision=?').run(now(),error.safeToExpose?error.message:'עדכון הפתקים לא הושלם.',user.id,input.expectedRevision);throw error;
   }finally{inFlight.delete(user.id);}
  }else throw serviceError('פעולת הפתקים אינה נתמכת.');
  return serviceJSON(snapshot(user));
 };
 const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(error){return serviceJSON({error:error.safeToExpose?error.message:'חיבור פתקי הקנייה לא הושלם. נסו שוב.'},error.safeToExpose?error.status:503);}};
 return{begin:safe(begin),callback:safe(callback),handle:safe(handle),snapshot};
}
