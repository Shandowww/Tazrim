import {OAuth2Client} from 'google-auth-library';
import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {readFile,rm} from 'node:fs/promises';
import {encryptedDatabaseBackup} from './backup-crypto.mjs';
const SCOPE='https://www.googleapis.com/auth/drive.appdata',digest=x=>createHash('sha256').update(x).digest('hex');
const cookie=(value,age=600)=>`__Host-mf_drive=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const redirect=(url,value)=>new Response(null,{status:303,headers:{Location:url,'Cache-Control':'no-store',...(value!==undefined?{'Set-Cookie':cookie(value,value?600:0)}:{})}});
// Civil dates keep the 23:59 cutoff correct through Israeli daylight-saving changes.
export function backupCutoffDay(timestamp){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));
 const day=parts.year+'-'+parts.month+'-'+parts.day;
 return parts.hour==='23'&&parts.minute==='59'?day:new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
}
// Return only fixed guidance: provider errors may contain tokens or private request data.
export function backupFailureMessage(error,stage){
 const data=error?.response?.data,details=data?.error?.details??[],reasons=data?.error?.errors??[];
 if(details.some(x=>x.reason==='SERVICE_DISABLED')||reasons.some(x=>x.reason==='accessNotConfigured'))return 'Google Drive API אינו מופעל בפרויקט Google Cloud. הפעילו אותו בפרויקט של חיבור Google ונסו שוב.';
 if(data?.error==='invalid_grant'||error?.response?.status===401)return 'הרשאת Google Drive פגה או בוטלה. חברו מחדש את Google Drive ונסו שוב.';
 if(reasons.some(x=>x.reason==='storageQuotaExceeded'))return 'אין מספיק מקום ב־Google Drive. פנו מקום ונסו שוב.';
 if(stage==='snapshot')return 'לא ניתן להכין גיבוי מוצפן בשרת. יש לבדוק את מפתח ההצפנה, תקינות מסד הנתונים, הרשאות הקבצים והמקום הפנוי בשרת.';
 if(stage==='credentials')return 'לא ניתן לפתוח את הרשאת הגיבוי השמורה. חברו מחדש את Google Drive; אם התקלה חוזרת יש לבדוק את מפתח ההרשאות בשרת.';
 if(stage==='verify')return 'הקובץ הועלה אך בדיקת ההורדה החוזרת לא הושלמה. הגיבוי אינו מאומת; בדקו חיבור והרשאות ונסו שוב.';
 return 'העלאת הגיבוי ל־Google Drive נכשלה. בדקו הרשאה, הפעלת Drive API וחיבור לרשת ונסו שוב.';
}
export function createDriveBackup({db,origin,clientId,clientSecret,admins,source='/app/data/monthly-flow.sqlite',keyFile='/app/data/drive-token-key',publicKeyFile='/app/data/backup-recipient.pem',directory='/app/data/encrypted-backups',oauthFactory=()=>new OAuth2Client(clientId,clientSecret,origin+'/auth/google/callback'),snapshot=encryptedDatabaseBackup,now=()=>Date.now()}){
 db.exec(`CREATE TABLE IF NOT EXISTS drive_backup_connections(user_id TEXT PRIMARY KEY,email TEXT NOT NULL,credentials TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,last_success INTEGER,last_attempt INTEGER,last_file TEXT,last_hash TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS drive_backup_pending(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,verifier TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL);`);
 // Operational columns are added idempotently for existing connections.
 db.exec('CREATE TABLE IF NOT EXISTS report_backup_coverage(id TEXT PRIMARY KEY,scope TEXT NOT NULL,source_hash TEXT NOT NULL,revision INTEGER NOT NULL,archive_hash TEXT NOT NULL,verified_at INTEGER NOT NULL)');
 const columns=new Set(db.prepare('PRAGMA table_info(drive_backup_connections)').all().map(r=>r.name));
 for(const [name,type]of [['schedule_mode',"TEXT NOT NULL DEFAULT 'daily'"],['last_change_version','INTEGER'],['last_scheduled_day','TEXT']])if(!columns.has(name))db.exec(`ALTER TABLE drive_backup_connections ADD COLUMN ${name} ${type}`);
 db.exec('CREATE TABLE IF NOT EXISTS backup_data_state(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);INSERT OR IGNORE INTO backup_data_state VALUES(1,0)');
 function trackTables(){
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  const tracked={plan_history:null,gmail_connections:['data','enabled','since','until_time','page_token'],bank_mail_notices:null,report_submissions:null,report_sources:null,report_store_keys:null,report_privacy:null,report_expectations:null,report_commits:null,report_connections:['token_hash','revoked','budget','user_id'],plans:['data'],budgets:['data','name'],auth_users:['email'],budget_members:null,budget_member_roles:null,budget_invitation_roles:null,budget_invitations:null,auth_access:null,wallet_events:null,wallet_connections:['hash','user_id','budget_id','scope','card_id','label','revoked'],wallet_merchant_categories:null,push_devices:['subscription','user_id'],push_schedules:['cards']};
  for(const [table,selected]of Object.entries(tracked))if(tables.has(table))for(const event of ['INSERT','UPDATE','DELETE']){
   const fields=selected??db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);
   const clause=event==='UPDATE'&&fields?' OF '+fields.join(','):'';
   const condition=event==='UPDATE'&&fields?' WHEN '+fields.map(f=>`OLD.${f} IS NOT NEW.${f}`).join(' OR '):'';
   db.exec(`CREATE TRIGGER IF NOT EXISTS backup_changed_${table}_${event.toLowerCase()} AFTER ${event}${clause} ON ${table}${condition} BEGIN UPDATE backup_data_state SET version=version+1 WHERE id=1; END`);
  }
 }
 trackTables();
 const changeVersion=()=>db.prepare('SELECT version FROM backup_data_state WHERE id=1').get().version;
 let running=false;
 const allowed=user=>!!user&&admins.has(user.email.toLowerCase());
 const secret=()=>{if(!existsSync(keyFile))try{writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}const key=readFileSync(keyFile);if(key.length!==32)throw Error('Invalid backup token key');return key;};
 const seal=(value,id)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv);cipher.setAAD(Buffer.from(id));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});};
 const open=(value,id)=>{const b=JSON.parse(value),cipher=createDecipheriv('aes-256-gcm',secret(),Buffer.from(b.iv,'base64'));cipher.setAAD(Buffer.from(id));cipher.setAuthTag(Buffer.from(b.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(b.data,'base64')),cipher.final()]).toString());};
 const status=user=>{const c=db.prepare('SELECT * FROM drive_backup_connections WHERE user_id=?').get(user.id);return{connected:!!c,enabled:!!c?.enabled,scheduleMode:c?.schedule_mode??'changes-nightly',timeZone:'Asia/Jerusalem',scheduledTime:'23:59',pendingChanges:!!c&&(c.last_change_version===null||changeVersion()>c.last_change_version),ready:existsSync(publicKeyFile),lastSuccess:c?.last_success??null,lastAttempt:c?.last_attempt??null,error:c?.error??null,running};};
 async function run(user){
  if(!allowed(user))throw Error('Administrator required');if(running)throw Error('Backup already running');const connection=db.prepare('SELECT * FROM drive_backup_connections WHERE user_id=?').get(user.id);if(!connection)throw Error('Connect Google Drive first');
  running=true;const coveredVersion=changeVersion();let archive,stage='credentials';db.prepare('UPDATE drive_backup_connections SET last_attempt=?,error=NULL WHERE user_id=?').run(now(),user.id);
  try{
   const oauth=oauthFactory();oauth.setCredentials(open(connection.credentials,user.id));stage='snapshot';archive=await snapshot({source,publicKeyFile,directory});const bytes=await readFile(archive.file),boundary='budgit-'+randomBytes(18).toString('hex'),metadata={name:archive.file.split('/').at(-1),parents:['appDataFolder'],appProperties:{type:'budgit-encrypted-server-backup',sha256:archive.sha256}};
   const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
   stage='upload';const upload=await oauth.request({url:'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum',method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},data:body,timeout:120000,retry:false});
   const file=upload.data;if(!file?.id)throw Error('Upload not confirmed');
   stage='verify';const downloaded=await oauth.request({url:'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',responseType:'arraybuffer',timeout:120000,retry:false});
   if(digest(Buffer.from(downloaded.data))!==archive.sha256)throw Error('Cloud verification failed');
   // Coverage comes from the immutable SQLite snapshot, never from the current live rows.
   db.exec('BEGIN IMMEDIATE');try{for(const r of archive.reportCoverage??[])db.prepare('INSERT INTO report_backup_coverage VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,source_hash=excluded.source_hash,revision=excluded.revision,archive_hash=excluded.archive_hash,verified_at=excluded.verified_at').run(r.id,r.scope,r.sourceHash,r.revision,archive.sha256,now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   // Do not enable the schedule implicitly; the administrator chooses it separately.
   db.prepare('UPDATE drive_backup_connections SET last_success=?,last_file=?,last_hash=?,last_change_version=?,error=NULL WHERE user_id=?').run(now(),file.id,archive.sha256,coveredVersion,user.id);
   return status(user);
  }catch(error){const message=backupFailureMessage(error,stage);db.prepare('UPDATE drive_backup_connections SET error=? WHERE user_id=?').run(message,user.id);throw Error(message);}
  finally{if(archive)await rm(archive.file,{force:true});running=false;}
 }
 async function begin(user){
  if(!allowed(user))return json({error:'נדרשת הרשאת מנהל.'},403);if(!clientId||!clientSecret||!existsSync(publicKeyFile))return json({error:'יש להשלים את הגדרת מפתח השחזור לפני חיבור Drive.'},503);
  db.prepare('DELETE FROM drive_backup_pending WHERE expires<=?').run(now());const state='dbk.'+randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),oauth=oauthFactory(),pkce=await oauth.generateCodeVerifierAsync();
  db.prepare('INSERT INTO drive_backup_pending VALUES(?,?,?,?,?)').run(digest(state),user.id,pkce.codeVerifier,nonce,now()+600000);
  return redirect(oauth.generateAuthUrl({scope:['openid','email',SCOPE],state,nonce,access_type:'offline',prompt:'consent',code_challenge:pkce.codeChallenge,code_challenge_method:'S256',login_hint:user.email}),state);
 }
 async function callback(request,user){
  const url=new URL(request.url),state=url.searchParams.get('state'),cookies=Object.fromEntries((request.headers.get('cookie')??'').split(';').map(x=>x.trim().split('=')));
  if(!allowed(user)||!state||cookies['__Host-mf_drive']!==state)return json({error:'חיבור הגיבוי לא אומת. התחילו מחדש מתוך האפליקציה.'},403);
  const pending=db.prepare('DELETE FROM drive_backup_pending WHERE hash=? AND user_id=? AND expires>? RETURNING *').get(digest(state),user.id,now());
  if(!pending||!url.searchParams.get('code'))return redirect('/?driveBackup=failed','');
  try{
   const oauth=oauthFactory(),{tokens}=await oauth.getToken({code:url.searchParams.get('code'),codeVerifier:pending.verifier});const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId}),identity=ticket.getPayload();
   if(identity?.email_verified!==true||identity.email?.toLowerCase()!==user.email.toLowerCase()||identity.nonce!==pending.nonce||!tokens.scope?.split(' ').includes(SCOPE))throw Error('Wrong identity or scope');
   const previous=db.prepare('SELECT credentials FROM drive_backup_connections WHERE user_id=?').get(user.id),refresh=tokens.refresh_token||(previous?open(previous.credentials,user.id).refresh_token:null);if(!refresh)throw Error('Offline permission required');
   db.prepare('INSERT INTO drive_backup_connections(user_id,email,credentials,schedule_mode) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET credentials=excluded.credentials,email=excluded.email,error=NULL').run(user.id,user.email,seal({refresh_token:refresh},user.id),'changes-nightly');
   return redirect('/?driveBackup=connected','');
  }catch{return redirect('/?driveBackup=failed','');}
 }
 async function files(request,user){
  if(!allowed(user))return json({error:'נדרשת הרשאת מנהל.'},403);
  const connection=db.prepare('SELECT credentials FROM drive_backup_connections WHERE user_id=?').get(user.id);if(!connection)return json({error:'יש לחבר את Google Drive.'},400);
  const oauth=oauthFactory();oauth.setCredentials(open(connection.credentials,user.id));
  try{
   const id=new URL(request.url).searchParams.get('file');
   if(id){
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))return json({error:'מזהה לא תקין.'},400);
    const meta=await oauth.request({url:'https://www.googleapis.com/drive/v3/files/'+id+'?fields=name,size,appProperties',timeout:30000});
    if(meta.data?.appProperties?.type!=='budgit-encrypted-server-backup'||Number(meta.data.size)>100000000)return json({error:'זה אינו ארכיון גיבוי נתמך.'},400);
    const downloaded=await oauth.request({url:'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',responseType:'arraybuffer',timeout:120000});
    if(digest(Buffer.from(downloaded.data))!==meta.data.appProperties.sha256)return json({error:'בדיקת הגיבוי נכשלה.'},503);
    return new Response(downloaded.data,{headers:{'Cache-Control':'no-store','Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="budgit-recovery.backup"'}});
   }
   const params=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='type' and value='budgit-encrypted-server-backup' }",fields:'files(id,name,createdTime,size),nextPageToken',orderBy:'createdTime desc',pageSize:'30'});
   const response=await oauth.request({url:'https://www.googleapis.com/drive/v3/files?'+params,timeout:30000});return json({files:response.data.files??[],more:!!response.data.nextPageToken});
  }catch{return json({error:'לא ניתן לקרוא את הגיבויים מ־Drive. בדקו חיבור והרשאות.'},503);}
 }
 async function handle(request,user){
  if(!allowed(user))return json({error:'נדרשת הרשאת מנהל.'},403);
  if(request.method==='GET')return json(status(user));if(request.method!=='POST')return json({error:'הפעולה אינה נתמכת.'},405);
  let body;try{body=await request.json();}catch{return json({error:'בקשה לא תקינה.'},400);}
  if(body.action==='run'){try{await run(user);return json(status(user));}catch(e){return json({error:e.message},503);}}
  if(body.action==='schedule'&&typeof body.enabled==='boolean'){
   const c=status(user),mode=body.mode??c.scheduleMode;
   if(!['daily','changes-nightly'].includes(mode))return json({error:'יש לבחור תזמון גיבוי תקין.'},400);
   if(!c.connected||!c.ready)return json({error:'יש להשלים חיבור ומפתח שחזור.'},400);
   // Newly enabled schedules start at the next cutoff; existing failures keep their retry window.
   const reset=body.enabled&&(!c.enabled||mode!==c.scheduleMode);
   db.prepare('UPDATE drive_backup_connections SET enabled=?,schedule_mode=?,last_scheduled_day=CASE WHEN ? THEN ? ELSE last_scheduled_day END WHERE user_id=?').run(+body.enabled,mode,+reset,backupCutoffDay(now()),user.id);
   return json(status(user));
  }
  if(body.action==='disconnect'){if(running)return json({error:'יש להמתין לסיום הגיבוי.'},409);db.prepare('DELETE FROM drive_backup_connections WHERE user_id=?').run(user.id);db.prepare('DELETE FROM drive_backup_pending WHERE user_id=?').run(user.id);return json(status(user));}
  return json({error:'בקשה לא תקינה.'},400);
 }
 async function tick(){
  if(running)return;
  for(const c of db.prepare('SELECT * FROM drive_backup_connections WHERE enabled=1').all()){
   if(!admins.has(c.email.toLowerCase()))continue;
   const user={id:c.user_id,email:c.email};
   if(c.schedule_mode==='changes-nightly'){
    const due=backupCutoffDay(now());
    if(c.last_scheduled_day&&c.last_scheduled_day>=due)continue;
    if(c.last_change_version!==null&&changeVersion()<=c.last_change_version){db.prepare('UPDATE drive_backup_connections SET last_scheduled_day=? WHERE user_id=?').run(due,c.user_id);continue;}
    if(c.error&&c.last_attempt&&now()-c.last_attempt<15*60000)continue;
    try{await run(user);db.prepare('UPDATE drive_backup_connections SET last_scheduled_day=? WHERE user_id=?').run(due,c.user_id);}catch{}
   }else if(!c.last_attempt||now()-c.last_attempt>=86400000){try{await run(user);}catch{}}
  }
 }

 return{begin,callback,handle,tick,status,files,trackTables};
}
