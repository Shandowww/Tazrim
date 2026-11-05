import {budgetAccess,serviceJSON,boundedJSON,serviceError} from './budget-access.mjs';
import {sealReport,openReport,reportHash} from './report-crypto.mjs';
import {extractStatementNotices,normalizeNoticeText} from '../dist/server/statement-notices.mjs';
import {isVault} from '../dist/server/vault.js';
export function createStatementNotices(db,{isAllowed,secret,now=()=>Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS statement_notice_scans(source_id TEXT PRIMARY KEY REFERENCES report_sources(id) ON DELETE CASCADE,scope TEXT NOT NULL,source_hash TEXT NOT NULL,data BLOB NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL)');
 const read=row=>JSON.parse(openReport(secret(),row.data,row.scope+'|'+row.source_id+'|notices'));
 const reportName=row=>JSON.parse(openReport(secret(),row.metadata,row.scope+'|'+row.id+'|metadata')).name;
 const sources=scope=>db.prepare('SELECT id,scope,source_hash,metadata,revision,state,kind,target,month,created_at FROM report_sources WHERE scope=? AND state<>? ORDER BY created_at DESC LIMIT 500').all(scope,'archived');
 const snapshot=scope=>{
  const notices=[],scans=[],seen=new Map();
  for(const source of sources(scope)){
   const row=db.prepare('SELECT * FROM statement_notice_scans WHERE source_id=? AND scope=? AND source_hash=?').get(source.id,scope,source.source_hash),data=row?read(row):null,name=reportName(source);
   const sourceInfo={id:source.id,name,revision:source.revision,state:source.state,kind:source.kind,target:source.target,month:source.month,createdAt:source.created_at,sourceHash:source.source_hash};
   scans.push({source:sourceInfo,status:data?.status??'pending',revision:row?.revision??0,count:data?.notices.length??0});
   for(const notice of data?.notices??[]){
    const fingerprint=reportHash(JSON.stringify([notice.issuer,source.target??(notice.issuer!=='unknown'&&notice.accountReference?notice.accountReference:source.id),normalizeNoticeText(notice.text),notice.dates]));
    if(seen.has(fingerprint)){seen.get(fingerprint).sources.push({id:source.id,name,page:notice.page});continue}
    const value={...notice,id:fingerprint,sourceId:source.id,sourceName:name,target:source.target,sourceHash:source.source_hash,sources:[{id:source.id,name,page:notice.page}],evidence:fingerprint};seen.set(fingerprint,value);notices.push(value);
   }
  }
  return{notices,scans};
 };
 const handle=async(request,user)=>{try{
  const url=new URL(request.url),budget=url.searchParams.get('budget')??'personal',access=budgetAccess(db,user,budget,{isAllowed,write:request.method!=='GET'}),bound=request.headers.get('x-budget-account-id');
  if(bound!==user.id)throw serviceError('החשבון השתנה. יש לפתוח מחדש את העדכונים.',403);
  if(isVault(access.plan)&&!db.prepare('SELECT consented FROM report_privacy WHERE scope=?').get(access.scope)?.consented)throw serviceError('נדרש אישור בעל המרחב לשמירת תוכן דוחות הנגיש לשרת.',409);
  const identity={accountId:user.id,accountEmail:user.email,budgetId:budget,noticeIdentityBound:true};
  if(request.method==='GET')return serviceJSON({...identity,...snapshot(access.scope)});
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  const input=await boundedJSON(request,1024*1024);
  const currentAccess=budgetAccess(db,user,budget,{isAllowed,write:true});
  if(isVault(currentAccess.plan)&&!db.prepare('SELECT consented FROM report_privacy WHERE scope=?').get(currentAccess.scope)?.consented)throw serviceError('נדרש אישור בעל המרחב לשמירת תוכן דוחות הנגיש לשרת.',409);
  const source=db.prepare('SELECT * FROM report_sources WHERE id=? AND scope=? AND state<>?').get(input.sourceId,access.scope,'archived');
  if(!source)throw serviceError('קובץ המקור אינו זמין במרחב הזה.',404);
  if(input.sourceHash!==source.source_hash||!Number.isSafeInteger(input.revision))throw serviceError('מקור ההודעה השתנה. יש לפתוח מחדש.',409);
  if(!['complete','unsupported','failed'].includes(input.status))throw serviceError('מצב בדיקת ההודעות אינו תקין.');
  const parsed=input.status==='complete'?extractStatementNotices(input.pages):{version:1,issuer:'unknown',notices:[]};
  if(input.status==='complete'&&!input.pages.some(page=>page.text.trim()))throw serviceError('לא נמצא טקסט קריא בדוח.');
  const existing=db.prepare('SELECT * FROM statement_notice_scans WHERE source_id=?').get(source.id);
  const value={...(input.status!=='complete'&&existing?read(existing):parsed),status:input.status},text=Buffer.from(JSON.stringify(value));
  if(text.length>120000)throw serviceError('הודעות הדוח גדולות מדי לשמירה.',413);
  if(existing&&JSON.stringify(read(existing))===JSON.stringify(value))return serviceJSON({...identity,ok:true,revision:existing.revision,recovered:true});
  if((existing?.revision??0)!==input.revision)throw serviceError('בדיקת ההודעות השתנתה במכשיר אחר. רעננו לפני ניסיון נוסף.',409);
  const encrypted=sealReport(secret(),text,access.scope+'|'+source.id+'|notices');
  const used=db.prepare('SELECT COALESCE(SUM(length(data)),0) AS bytes FROM statement_notice_scans').get().bytes;
  if(used-(existing?.data.length??0)+encrypted.length>5*1024*1024)throw serviceError('אין מקום להודעות נוספות. הדוח והנתונים הכספיים נשמרו.',413);
  db.prepare('INSERT INTO statement_notice_scans VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at').run(source.id,access.scope,source.source_hash,encrypted,(existing?.revision??0)+1,now());
  return serviceJSON({...identity,ok:true,revision:(existing?.revision??0)+1});
 }catch(error){return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן לבדוק את הודעות הדוח כרגע.'},error.safeToExpose?error.status:503)}};
 return{handle,snapshot};
}
