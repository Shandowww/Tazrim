import {budgetAccess,boundedJSON,serviceError,serviceJSON} from './budget-access.mjs';
import {sealReport,openReport,reportHash} from './report-crypto.mjs';
import {fullReportReceipt} from './report-cleanup.mjs';
import {bankDuplicateProof,bankDuplicateProofCurrent} from './bank-duplicate-proof.mjs';
import {isVault} from '../dist/server/vault.js';
import {reportLifecycleState,validReportReview,REPORT_RETENTION_MS} from '../dist/server/report-lifecycle-model.js';
import {buildReportInbox} from '../dist/server/report-inbox-controller.js';
import * as classifier from '../dist/import-readers/classifier.mjs';
import * as activityAPI from '../dist/import-readers/cal-activity.mjs';

// Dedicated original-retention transition. Source identities and financial/history
// records are never deleted. Ordinary source deletion has different semantics.
export function createReportLifecycle(db,{secret,isAllowed,now=()=>Date.now(),enabled=false,cleanupComplete}={}){
 if(!db.prepare('PRAGMA table_info(report_sources)').all().some(c=>c.name==='original_removed_at'))db.exec('ALTER TABLE report_sources ADD COLUMN original_removed_at INTEGER');
 db.exec(`CREATE TABLE IF NOT EXISTS report_lifecycle(source_id TEXT PRIMARY KEY REFERENCES report_sources(id) ON DELETE CASCADE,scope TEXT NOT NULL,source_hash TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,reviewed_at INTEGER,completed_at INTEGER,removed_at INTEGER,data BLOB NOT NULL);
 CREATE INDEX IF NOT EXISTS report_lifecycle_due ON report_lifecycle(completed_at,removed_at);`);
 const columns=new Set(db.prepare('PRAGMA table_info(report_lifecycle)').all().map(c=>c.name));for(const [name,type]of [['needs_verification','INTEGER NOT NULL DEFAULT 0'],['retry_after','INTEGER NOT NULL DEFAULT 0']])if(!columns.has(name))db.exec('ALTER TABLE report_lifecycle ADD COLUMN '+name+' '+type);
 const source=(scope,id)=>db.prepare('SELECT * FROM report_sources WHERE scope=? AND id=?').get(scope,id);
 const record=id=>db.prepare('SELECT * FROM report_lifecycle WHERE source_id=?').get(id);
 const read=row=>row?JSON.parse(openReport(secret(),row.data,'report-lifecycle|'+row.scope+'|'+row.source_id)):{};
 const draft=row=>row.draft?JSON.parse(openReport(secret(),row.draft,row.scope+'|'+row.id+'|draft')):null;
 const metadata=row=>JSON.parse(openReport(secret(),row.metadata,row.scope+'|'+row.id+'|metadata'));
 const write=(row,data,{reviewedAt,completedAt,removedAt}={})=>{
  const previous=record(row.id),blob=sealReport(secret(),Buffer.from(JSON.stringify(data)),'report-lifecycle|'+row.scope+'|'+row.id);
  db.prepare('INSERT INTO report_lifecycle(source_id,scope,source_hash,revision,reviewed_at,completed_at,removed_at,data,needs_verification) VALUES(?,?,?,1,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET revision=report_lifecycle.revision+1,reviewed_at=excluded.reviewed_at,completed_at=excluded.completed_at,removed_at=excluded.removed_at,data=excluded.data,needs_verification=excluded.needs_verification,retry_after=0').run(row.id,row.scope,row.source_hash,reviewedAt===undefined?previous?.reviewed_at??null:reviewedAt,completedAt===undefined?previous?.completed_at??null:completedAt,removedAt===undefined?previous?.removed_at??null:removedAt,blob,+!!(data.completion&&!data.completion.verified));
 };
 const accessFor=data=>{
  const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(data.actorId);
  if(!user||!isAllowed(user.email))throw serviceError('הרשאת הטיפול בדוח אינה זמינה.',403);
  const access=budgetAccess(db,user,data.budget,{isAllowed,write:true});
  if(!access.plan||isVault(access.plan))throw serviceError('לא ניתן לאמת השלמה מול תקציב מוצפן או לא זמין.',409);
  return access;
 };
 const proofCurrent=(row,data)=>{
  try{
   if(!data.completion?.verified||!data.completion?.members?.length||data.review?.categories==='later'||data.activeDraft)return false;
   const access=accessFor(data);if(access.scope!==row.scope)return false;
   return data.completion.members.every(member=>{
    const current=source(row.scope,member.id);
    return current&&current.source_hash===member.hash&&(current.original_removed_at!==null||current.revision===member.revision)&&(data.completion.kind==='duplicate'&&member.kind==='bank'&&member.bankProof?member.target===member.bankProof.target&&!access.plan.importMigrationGuards?.receipts?.includes(member.hash)&&bankDuplicateProofCurrent(access.plan,member.bankProof):fullReportReceipt(access.plan,{...member,hash:member.financialHash??member.hash}));
   });
  }catch{return false;}
 };
 const state=(scope,id)=>{
  const row=source(scope,id);if(!row)return null;
  if(scope.startsWith('incoming:')){const a=db.prepare('SELECT * FROM report_intake_approvals WHERE intake_id=? AND source_hash=?').get(id,row.source_hash);if(a?.report_id){try{const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(scope.slice(9)),access=budgetAccess(db,user,a.budget,{isAllowed});const target=source(access.scope,a.report_id);if(target?.source_hash===row.source_hash)return{...state(access.scope,a.report_id),originalRemoved:row.original_removed_at!==null,removedAt:row.original_removed_at};}catch{}}}
  if(!record(id)&&row.state==='committed'&&row.original_removed_at===null){
   const owner=scope.startsWith('personal:')?scope.slice(9):db.prepare('SELECT owner_id FROM budgets WHERE id=?').get(scope.slice(7))?.owner_id,user=owner&&db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(owner);
   if(user&&isAllowed(user.email))try{observeCommit(user,scope.startsWith('personal:')?'personal':scope.slice(7),[id]);}catch{}
  }
  let stored=record(id),data=read(stored);const complete=Number.isSafeInteger(stored?.completed_at)&&proofCurrent(row,data);
  if(stored?.completed_at!==null&&stored?.completed_at!==undefined&&!complete&&row.original_removed_at===null){write(row,{...data,retentionReason:'קבלת ההשלמה השתנתה; יש לבדוק שוב את הדוח.'},{completedAt:null});stored=record(id);data=read(stored);}
  return{...reportLifecycleState({reviewed:!!stored?.reviewed_at,complete,deferred:data.review?.categories==='later',completedAt:stored?.completed_at??null,removedAt:row.original_removed_at??null,reason:data.retentionReason??(!complete&&stored?.completed_at?'קבלת ההשלמה השתנתה; הדוח נשמר לבדיקה.':null)}),review:data.review??null,reviewRevision:stored?.revision??0,completionKind:complete?data.completion.kind:null,applied:row.state==='committed'||!!data.completion,automaticRemovalEnabled:enabled};
 };
 const userProgress=(user,budget,ids)=>{
  const access=budgetAccess(db,user,budget,{isAllowed,write:true});
  for(const id of ids){const row=source(access.scope,id);if(!row||row.original_removed_at!==null)continue;const saved=draft(row),stored=record(id),old=read(stored),review=validReportReview(saved?.guided)?saved.guided:null;
   write(row,{...old,actorId:user.id,budget,review,completion:null,retentionReason:null},{reviewedAt:now(),completedAt:null});
  }
 };
 const observeCommit=(user,budget,ids)=>{
  const access=budgetAccess(db,user,budget,{isAllowed,write:true});
  for(const id of ids){const row=source(access.scope,id);if(!row||row.original_removed_at!==null)continue;const stored=record(id),old=read(stored),saved=draft(row),review=validReportReview(saved?.guided)?saved.guided:old.review;
   const proof=metadata(row).localCleanup;
   const classified=!isVault(access.plan)&&!(access.plan?.details??[]).some(d=>d.category==='לסיווג'&&proof?.members?.some(m=>m.kind==='card'&&m.target===d.method&&m.reference===d.statement?.dueDate));
   const categoriesResolved=review?review.categories==='resolved':classified;
   const reusable=old.completion?.verified&&old.completion?.members?.some(m=>m.id===id&&m.hash===row.source_hash&&m.revision===row.revision);const complete=categoriesResolved&&reusable&&cleanupComplete(access,id,row.source_hash);
   write(row,{...old,actorId:user.id,budget,review:review??null,completion:proof?.members?{kind:'import',members:proof.members,verified:!!reusable}:null,retentionReason:complete?null:review?.categories==='later'?'נשאר סיווג להשלמה.':'לא הוכחה השלמה של כל חלקי הדוח; המקור נשמר.'},{reviewedAt:stored?.reviewed_at??now(),completedAt:complete?stored?.completed_at??now():null});
  }
 };
 const verify=async(user,budget,ids)=>{
  const {readAutomaticSource}=await import('./report-automation.mjs');
  for(const id of ids){
   let access=budgetAccess(db,user,budget,{isAllowed,write:true}),row=source(access.scope,id),entry=record(id),data=read(entry);if(data.activeDraft)data={...data,review:data.activeDraft.guided};if(!row||data.completion?.verified&&!data.activeDraft||row.original_removed_at!==null)continue;
   try{
    const saved=data.activeDraft??draft(row),item=saved?.items?.find(i=>i.storedId===id&&i.hash===row.source_hash);if(!item)throw serviceError('חסרה עדות מלאה לחלקי המקור; הקובץ נשמר.',409);
    const bytes=openReport(secret(),row.source,row.scope+'|'+id+'|source');if(reportHash(bytes)!==row.source_hash)throw serviceError('עדות המקור השתנתה; הקובץ נשמר.',409);
    const {parsed}=await readAutomaticSource(metadata(row).name,bytes);
    if(parsed.activity&&item.activity){
     if(JSON.stringify(parsed.activity)!==JSON.stringify(item.activity)||item.skip||item.error||parsed.sheets||parsed.activity.entries.some(r=>r.pending||r.installment||!r.dueDate))throw serviceError('נשארו מחזורים או שורות שטרם הושלמו. המקור נשמר.',409);
     const cycles=[...new Set(parsed.activity.entries.map(r=>r.dueDate))].sort(),members=[];
     for(const cycle of cycles){const entries=parsed.activity.entries.filter(r=>r.dueDate===cycle),total=entries.reduce((sum,r)=>sum+r.amountCents,0);activityAPI.calActivityReport(parsed.activity,cycle,String(total/100),true);const member={id,hash:row.source_hash,revision:row.revision,kind:'card',target:item.target,reference:cycle,financialHash:reportHash(row.source_hash+':cal-cycle:'+cycle)};if(!fullReportReceipt(access.plan,{...member,hash:member.financialHash}))throw serviceError('נשאר מחזור פעילות שלא נקלט. המקור נשמר.',409);members.push(member);}
     data={...data,review:saved.guided??data.review,completion:{kind:'import',members,verified:false}};
    }else if(parsed.skip||parsed.kind!==item.kind||parsed.sheets||item.activity||item.sheets||item.skip||item.error)throw serviceError('לא הוכחה השלמה של כל חלקי הקובץ; המקור נשמר.',409);
    const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
    if(!parsed.activity&&(item.kind==='card'&&(!equal(parsed.report?.entries,item.report?.entries)||parsed.report?.amount!==item.report?.amount||parsed.report?.dueDate!==item.report?.dueDate)||item.kind==='bank'&&(item.bankOptions?.scope!=='complete'||!equal(parsed.records,item.records)||item.from>parsed.from||item.to<parsed.to||Object.values(item.monthDecisions??{}).includes('skip'))))throw serviceError('יש חלקים במקור שלא נכללו בטיפול; הקובץ נשמר.',409);
    if(data.activeDraft&&!parsed.activity)data={...data,completion:{kind:'import',verified:false,members:[{id,hash:row.source_hash,revision:row.revision,kind:item.kind,target:item.target,reference:item.kind==='card'?item.report?.dueDate:item.id}]}};
    access=budgetAccess(db,user,budget,{isAllowed,write:true});const current=source(access.scope,id);if(!current||record(id)?.revision!==entry?.revision||current.revision!==row.revision||current.source_hash!==row.source_hash||!data.completion?.members.every(m=>fullReportReceipt(access.plan,{...m,hash:m.financialHash??m.hash})))throw serviceError('העדויות השתנו בזמן הבדיקה; יש לבדוק שוב.',409);
    const complete=data.review?.categories!=='later'&&(data.review?.categories==='resolved'||!(access.plan.details??[]).some(d=>d.category==='לסיווג'&&data.completion.members.some(m=>m.kind==='card'&&d.method===m.target&&d.statement?.dueDate===m.reference)));
    write(current,{...data,activeDraft:null,completion:{...data.completion,verified:true},retentionReason:complete?null:'נשאר סיווג להשלמה.'},{completedAt:complete?entry.completed_at??now():null});
   }catch(error){const current=source(row.scope,id);if(current&&record(id)?.revision===entry?.revision&&current.original_removed_at===null)write(current,{...data,retentionReason:error.safeToExpose?error.message:'לא ניתן לאמת כרגע את כל חלקי הדוח. המקור נשמר.'},{completedAt:null});db.prepare('UPDATE report_lifecycle SET retry_after=? WHERE source_id=?').run(now()+60000,id);}
  }
 };
 const automaticProgress=(user,budget,ids)=>{const access=budgetAccess(db,user,budget,{isAllowed,write:true});for(const id of ids){const row=source(access.scope,id);if(!row)continue;const old=read(record(id));write(row,{...old,actorId:user.id,budget,origin:'automatic'});}};
 const completeDuplicate=async(user,budget,id,revision,{reuseRemoved=false}={})=>{
  let access=budgetAccess(db,user,budget,{isAllowed,write:true}),row=source(access.scope,id),old=read(record(id));
  if(!row||row.revision!==revision||row.original_removed_at!==null||!access.plan||isVault(access.plan))throw serviceError('המקור השתנה או שלא ניתן לבדוק את התקציב.',409);
  if(old.completion?.kind==='duplicate'&&proofCurrent(row,old))return state(access.scope,id);
  const saved=old.activeDraft??draft(row),choice=saved?.items?.find(i=>i.storedId===id&&i.hash===row.source_hash);
  if(!choice||choice.skip||choice.activity||choice.sheets||saved.guided?.categories==='later'||!reuseRemoved&&saved.guided?.categories!=='resolved')throw serviceError('לא הוכח דוח כפול שלם ללא עבודה שנותרה.',409);
  const {readAutomaticSource}=await import('./report-automation.mjs'),bytes=openReport(secret(),row.source,row.scope+'|'+id+'|source');
  if(reportHash(bytes)!==row.source_hash)throw serviceError('חתימת המקור השתנתה.',409);
  const {parsed}=await readAutomaticSource(metadata(row).name,bytes);
  if(parsed.skip||parsed.activity||parsed.sheets||!['bank','card'].includes(parsed.kind)||parsed.kind!==choice.kind)throw serviceError('מבנה המקור דורש בדיקה ידנית.',409);
  access=budgetAccess(db,user,budget,{isAllowed,write:true});const current=source(access.scope,id);if(!current||current.revision!==revision||current.source_hash!==row.source_hash)throw serviceError('המקור השתנה בזמן הבדיקה.',409);
  const item={...parsed,id,hash:row.source_hash,storedId:id,storedRevision:revision,name:metadata(row).name,target:choice.target,payer:choice.payer,decisions:{},directIncluded:choice.directIncluded??{},monthDecisions:{},bankOptions:{scope:'complete'},skip:false};
  const ui={blank:false,startMonth:access.plan.startMonth,items:[item],newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map(saved.bankChoices??[]),duplicates:0,merchantRules:[]};
  await buildReportInbox(access.plan,ui,{month:new Date(now()).toISOString().slice(0,7),today:new Date(now()).toISOString().slice(0,10),classifier,activityAPI});
  if(ui.issues||!item.already||item.preview?.replacement)throw serviceError('נמצאו שינויים או בדיקות נדרשות; יש להמשיך בסקירה לפני שמירה.',409);
  const candidates=(access.plan.reportInbox?.receipts??[]).filter(r=>r.kind===item.kind&&r.target===item.target&&fullReportReceipt(access.plan,r));
  const receipt=item.kind==='card'?candidates.find(r=>r.reference===item.report?.dueDate):candidates.find(r=>access.plan.bankImport?.batches?.some(b=>b.id===r.reference&&b.accountId===item.target&&b.from<=item.from&&b.to>=item.to));
  const bankProof=!receipt&&item.kind==='bank'?bankDuplicateProof(access.plan,item):null;
  if(!receipt&&!bankProof)throw serviceError('אין עדות כספית עדכנית להשלמה ללא שינוי.',409);
  const reference=receipt?.reference??'bank-evidence:'+bankProof.digest,financialHash=receipt?.hash??bankProof.digest;
  const member={id,hash:row.source_hash,revision,kind:item.kind,target:item.target,reference,financialHash,...(bankProof?{bankProof}:{})};
  const prior=reuseRemoved?db.prepare('SELECT * FROM report_lifecycle WHERE scope=? AND removed_at IS NOT NULL ORDER BY removed_at DESC').all(access.scope).find(entry=>{const previous=read(entry);return previous.completion?.verified&&previous.review?.categories!=='later'&&previous.completion.members.some(m=>(m.financialHash??m.hash)===financialHash&&m.kind===item.kind&&m.target===item.target&&m.reference===reference);}):null;
  if(reuseRemoved&&!prior)return null;
  const refreshed=budgetAccess(db,user,budget,{isAllowed,write:true});if(source(access.scope,id)?.revision!==revision||refreshed.revision!==access.revision||!(bankProof?bankDuplicateProofCurrent(refreshed.plan,bankProof):fullReportReceipt(refreshed.plan,receipt)))throw serviceError('התקציב השתנה בזמן הבדיקה. יש לבדוק שוב.',409);
  const proofBytes=Buffer.byteLength(JSON.stringify(member)),used=db.prepare('SELECT COALESCE(SUM(length(data)),0) bytes FROM report_lifecycle WHERE scope=?').get(access.scope).bytes,all=db.prepare('SELECT COALESCE(SUM(length(data)),0) bytes FROM report_lifecycle').get().bytes;
  if(proofBytes>1024*1024||used+proofBytes>20*1024*1024||all+proofBytes>100*1024*1024)throw serviceError('אחסון אישורי ההשלמה מלא. המקור נשמר לבדיקה.',413);
  write(current,{...old,actorId:user.id,budget,activeDraft:null,review:reuseRemoved?read(prior).review:saved.guided??null,completion:{kind:'duplicate',verified:true,members:[member]},retentionReason:null},{reviewedAt:record(id)?.reviewed_at??now(),completedAt:prior?.completed_at??record(id)?.completed_at??now()});
  if(prior)purge(access.scope,id);
  return state(access.scope,id);
 };
 const linkedCopies=row=>{
  const ids=new Set([row.id]);
  for(const a of db.prepare('SELECT * FROM report_intake_approvals WHERE report_id=? AND source_hash=?').all(row.id,row.source_hash)){
   const incoming=source('incoming:'+a.user_id,a.intake_id);if(incoming&&incoming.source_hash===row.source_hash){const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(a.user_id);const access=budgetAccess(db,user,a.budget,{isAllowed,write:true});if(access.scope!==row.scope)throw serviceError('הגישה לעותק משויך השתנתה. המקור נשמר לבדיקה.',409);ids.add(incoming.id);}
  }
  return ids;
 };
 const purge=(scope,id)=>{
  const root=source(scope,id),stored=record(id),data=read(stored);
  if(!enabled||!root||root.original_removed_at!==null||!Number.isSafeInteger(stored?.completed_at)||now()<stored.completed_at+REPORT_RETENTION_MS)return false;
  db.exec('SAVEPOINT report_retention');
  try{
   const current=source(scope,id);if(!current||current.revision!==root.revision||!proofCurrent(current,data)){db.exec('RELEASE report_retention');return false;}
   const members=data.completion.members,ids=new Set();
   for(const member of members){const row=source(scope,member.id),entry=record(member.id),value=read(entry);if(!entry?.completed_at||now()<entry.completed_at+REPORT_RETENTION_MS||!proofCurrent(row,value))throw serviceError('מקור בקבוצה עדיין נדרש להשלמה; הקבצים נשמרים.',409);for(const copy of linkedCopies(row))ids.add(copy);}
   for(const sibling of db.prepare('SELECT * FROM report_sources WHERE draft IS NOT NULL AND original_removed_at IS NULL').all()){
    if(ids.has(sibling.id))continue;
    const saved=draft(sibling);
    if(saved?.items?.some(item=>ids.has(item.storedId)))throw serviceError('המקור נדרש לקבוצת דוחות שעדיין לא הושלמה.',409);
   }
   for(const pending of db.prepare('SELECT * FROM report_lifecycle WHERE removed_at IS NULL').all()){const active=read(pending).activeDraft;if(active?.items?.some(item=>ids.has(item.storedId)))throw serviceError('המקור נדרש לבדיקה מחודשת פעילה.',409);}
   const at=now();
   for(const copy of ids){const row=db.prepare('SELECT * FROM report_sources WHERE id=?').get(copy);if(!row||row.original_removed_at!==null)continue;
    const meta=metadata(row);delete meta.localCleanup;
    meta.originalRetention={version:1,completedAt:stored.completed_at,removedAt:at};
    db.prepare('UPDATE report_sources SET source=?,source_bytes=0,draft=NULL,metadata=?,original_removed_at=? WHERE id=? AND revision=?').run(sealReport(secret(),Buffer.alloc(0),row.scope+'|'+row.id+'|source'),sealReport(secret(),Buffer.from(JSON.stringify(meta)),row.scope+'|'+row.id+'|metadata'),at,row.id,row.revision);
    const previous=record(row.id),old=read(previous);
    write(row,{...old,actorId:data.actorId,budget:data.budget,review:null,completion:data.completion,retentionReason:null},{completedAt:previous?.completed_at??stored.completed_at,removedAt:at});
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_automation_jobs'").get())for(const job of db.prepare('SELECT * FROM report_automation_jobs WHERE intake_id=?').all(row.id)){
     const minimal=sealReport(secret(),Buffer.from(JSON.stringify({version:1,originalRemoved:true,completedAt:stored.completed_at,removedAt:at})), 'automation|'+job.user_id+'|'+job.intake_id);
     db.prepare('UPDATE report_automation_jobs SET data=?,revision=revision+1 WHERE user_id=? AND intake_id=?').run(minimal,job.user_id,job.intake_id);
    }
   }
   db.exec('RELEASE report_retention');return true;
  }catch(error){if(db.isTransaction){db.exec('ROLLBACK TO report_retention');db.exec('RELEASE report_retention');}const row=source(scope,id);if(row&&row.original_removed_at===null)write(row,{...data,retentionReason:error.safeToExpose?error.message:'הסרת המקור לא הושלמה. הקובץ נשמר לניסיון חוזר.'});db.prepare('UPDATE report_lifecycle SET retry_after=? WHERE source_id=?').run(now()+60000,id);return false;}
 };
 const ensureOriginal=(scope,id)=>{
  if(scope.startsWith('incoming:')){const a=db.prepare('SELECT * FROM report_intake_approvals WHERE intake_id=?').get(id);if(a?.report_id)purge(a.budget==='personal'?'personal:'+a.user_id:'budget:'+a.budget,a.report_id);}
  purge(scope,id);const row=source(scope,id);if(row?.original_removed_at!==null&&row?.original_removed_at!==undefined)throw serviceError('המקור הוסר לפי מדיניות 30 הימים. הנתונים הכספיים וההיסטוריה נשמרו.',410);
 };
 const sweep=async()=>{if(!enabled)return{removed:0};for(const pending of db.prepare('SELECT source_id FROM report_lifecycle WHERE needs_verification=1 AND removed_at IS NULL AND retry_after<=? ORDER BY retry_after,source_id LIMIT 2').all(now())){const data=read(record(pending.source_id));if(data.completion&&!data.completion.verified){const user=db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(data.actorId);try{await verify(user,data.budget,[pending.source_id]);}catch{}}}let removed=0;for(const row of db.prepare('SELECT source_id,scope FROM report_lifecycle WHERE completed_at<=? AND removed_at IS NULL AND retry_after<=? ORDER BY completed_at LIMIT 20').all(now()-REPORT_RETENTION_MS,now()))if(purge(row.scope,row.source_id))removed++;return{removed};};
 const activeReview=(scope,id,userId)=>{const row=record(id),data=read(row);return row?.scope===scope&&data.actorId===userId?data.activeDraft??null:null;};
 const handle=async(request,user)=>{try{
  if(request.headers.get('x-budget-account-id')!==user.id)throw serviceError('החשבון השתנה.',403);
  const url=new URL(request.url),budget=url.searchParams.get('budget')??'personal',access=budgetAccess(db,user,budget,{isAllowed,write:request.method!=='GET'}),id=url.searchParams.get('id'),row=source(access.scope,id);
  if(!row)throw serviceError('הדוח אינו זמין במרחב הזה.',404);
  if(request.method==='GET'){purge(access.scope,id);return serviceJSON({accountId:user.id,id,sourceHash:row.source_hash,revision:row.revision,...state(access.scope,id)});}
  const input=await boundedJSON(request);if(['complete-duplicate','resolve-categories','save-review'].includes(input.action)&&input.budgetRevision!==access.revision)throw serviceError('התקציב השתנה מאז הסיכום. יש לפתוח מחדש ולבדוק.',409);if(input.sourceHash!==row.source_hash||input.revision!==row.revision||row.original_removed_at!==null)throw serviceError('המקור השתנה או הוסר. יש לפתוח את התוצאה השמורה.',409);
  if(input.action==='save-review'){
   if(row.state!=='committed'||!input.draft||input.draft.version!==1||!validReportReview(input.draft.guided)||input.draft.guided.budgetRevision!==access.revision||!Array.isArray(input.draft.items)||input.draft.items.length!==1)throw serviceError('טיוטת הבדיקה אינה תואמת למקור שנקלט.',409);
   const item=input.draft.items[0],old=read(record(id));if(item.storedId!==id||item.hash!==row.source_hash||item.storedRevision!==row.revision||item.storedCommitted!==true)throw serviceError('עדות המקור השתנתה.',409);
   const identical=old.actorId===user.id&&JSON.stringify(old.activeDraft)===JSON.stringify(input.draft);
   if(!identical&&input.reviewRevision!==(record(id)?.revision??0))throw serviceError('הבדיקה השתנתה במכשיר אחר. יש לפתוח מחדש.',409);
   if(!identical){const text=JSON.stringify(input.draft);if(Buffer.byteLength(text)>3*1024*1024)throw serviceError('טיוטת הבדיקה גדולה מדי.',413);
    const used=db.prepare('SELECT COALESCE(SUM(length(data)),0) bytes FROM report_lifecycle WHERE scope=?').get(access.scope).bytes,all=db.prepare('SELECT COALESCE(SUM(length(data)),0) bytes FROM report_lifecycle').get().bytes;
    if(used+Buffer.byteLength(text)>20*1024*1024||all+Buffer.byteLength(text)>100*1024*1024)throw serviceError('אחסון הבדיקות מלא. הטיוטה לא נשמרה.',413);
    write(row,{...old,actorId:user.id,budget,review:input.draft.guided,activeDraft:input.draft,retentionReason:'בדיקה מחודשת פעילה; ההסרה מושהית.'},{reviewedAt:now(),completedAt:null});
   }
   return serviceJSON({ok:true,...state(access.scope,id)});
  }
  if(input.action==='resolve-categories'){
   const old=read(record(id));if(!old.completion||!proofCurrent(row,{...old,review:null}))throw serviceError('אין קבלת קליטה מלאה ועדכנית; יש להמשיך בבדיקת הדוח.',409);
   const missing=(access.plan.details??[]).some(d=>d.category==='לסיווג'&&old.completion.members.some(m=>m.kind==='card'&&d.method===m.target&&d.statement?.dueDate===m.reference));
   if(missing&&input.confirmUncategorized!==true)throw serviceError('נשאר סיווג להשלמה. אפשר לבחור במפורש להשאיר ללא קטגוריה.',409);
   const review={version:1,step:'summary',done:['account','figures','categories','summary'],categories:'resolved',budgetRevision:access.revision};write(row,{...old,actorId:user.id,budget,review,retentionReason:null},{completedAt:record(id)?.completed_at??now()});return serviceJSON({ok:true,...state(access.scope,id)});
  }
  if(input.action==='complete-duplicate')return serviceJSON({ok:true,...await completeDuplicate(user,budget,id,row.revision)});
  if(input.action==='verify-completion'){await verify(user,budget,[id]);return serviceJSON({ok:true,...state(access.scope,id)});}
  if(input.action==='reopen'){
   const old=read(record(id));write(row,{...old,completion:null,review:null,retentionReason:'הדוח נפתח להמשך בדיקה; מועד ההסרה בוטל.'},{reviewedAt:now(),completedAt:null});return serviceJSON({ok:true,...state(access.scope,id)});
  }
  throw serviceError('הפעולה אינה נתמכת.');
 }catch(error){return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן לעדכן את מצב הטיפול בדוח.'},error.safeToExpose?error.status:503);}};
 return{state,userProgress,automaticProgress,observeCommit,verify,completeDuplicate,ensureOriginal,sweep,handle,purge,activeReview};
}
