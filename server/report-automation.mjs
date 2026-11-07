import {Worker} from 'node:worker_threads';
import {budgetAccess,serviceError,serviceJSON,boundedJSON} from './budget-access.mjs';
import {reportHash,sealReport,openReport} from './report-crypto.mjs';
import {prepareAutomaticReport} from '../dist/server/report-automation-model.js';
import {isVault} from '../dist/server/vault.js';
import {cashAccountList,creditCards} from '../dist/server/budget.js';
import * as classifier from '../dist/import-readers/classifier.mjs';
import * as activityAPI from '../dist/import-readers/cal-activity.mjs';
import {parserVersion} from '../dist/server/report-parser-version.mjs';

export function readAutomaticSource(name,bytes,{timeoutMs=20000}={}){
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./report-automation-worker.mjs',import.meta.url),{workerData:{name,bytes},resourceLimits:{maxOldGenerationSizeMb:128}});let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);},timer=setTimeout(()=>finish(Error('פענוח הדוח ארך מדי. אפשר לפתוח לבדיקה ידנית.')),timeoutMs);worker.on('message',m=>m.error?finish(Error(m.error)):finish(null,m));worker.on('error',()=>finish(Error('פענוח הדוח לא הושלם. המקור נשמר.')));worker.on('exit',()=>{if(!settled)finish(Error('פענוח הדוח הופסק. המקור נשמר.'));});});
}
const states=new Set(['queued','working','review','attention','rejected','imported']);
const normalize=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(normalize):Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const planHash=p=>reportHash(JSON.stringify(normalize(p)));
/** Experimental Phase 2. All writes are policy, encrypted proposal, original
 * source routing/draft or issuer notices. There is no financial commit call. */
export function createReportAutomation(db,{origin,isAllowed,reportStore,intake,notices,now=()=>Date.now(),readSource=readAutomaticSource}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS report_automation_policies(user_id TEXT NOT NULL,budget TEXT NOT NULL,enabled INTEGER NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,budget));
 CREATE TABLE IF NOT EXISTS report_automation_jobs(user_id TEXT NOT NULL,intake_id TEXT NOT NULL REFERENCES report_sources(id) ON DELETE CASCADE,source_hash TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,data BLOB NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,intake_id));`);
 let running=false;
 const actor=user=>{const current=user&&db.prepare('SELECT email FROM auth_users WHERE id=?').get(user.id);if(!current||current.email!==user.email||!isAllowed(user.email))throw serviceError('הגישה לחשבון השתנתה.',403);};
 const key=()=>reportStore.secret(),read=row=>JSON.parse(openReport(key(),row.data,'automation|'+row.user_id+'|'+row.intake_id));
 const policies=user=>db.prepare('SELECT budget,enabled,revision FROM report_automation_policies WHERE user_id=?').all(user.id);
 const sourceRow=(user,id)=>db.prepare('SELECT id,source_hash,revision FROM report_sources WHERE scope=? AND id=?').get('incoming:'+user.id,id);
 const job=(user,id)=>db.prepare('SELECT * FROM report_automation_jobs WHERE user_id=? AND intake_id=?').get(user.id,id);
 const write=(user,id,hash,status,data)=>{if(!states.has(status))throw Error('Invalid automation state');const encrypted=sealReport(key(),Buffer.from(JSON.stringify(data)),'automation|'+user.id+'|'+id);const old=job(user,id),used=db.prepare('SELECT COALESCE(SUM(length(data)),0) n FROM report_automation_jobs WHERE user_id=?').get(user.id).n,all=db.prepare('SELECT COALESCE(SUM(length(data)),0) n FROM report_automation_jobs').get().n;if(used-(old?.data.length??0)+encrypted.length>10*1024*1024||all-(old?.data.length??0)+encrypted.length>50*1024*1024)throw serviceError('אחסון ההצעות מלא. יש להמשיך בדוח ידנית.',413);if(encrypted.length>3*1024*1024)throw serviceError('הצעת הדוח גדולה מדי. יש לפתוח לבדיקה ידנית.',413);db.prepare('INSERT INTO report_automation_jobs VALUES(?,?,?,?,1,?,?) ON CONFLICT(user_id,intake_id) DO UPDATE SET status=excluded.status,revision=report_automation_jobs.revision+1,data=excluded.data,updated_at=excluded.updated_at').run(user.id,id,hash,status,encrypted,now());};
 const internal=async(service,user,path,input)=>{const response=await service.handle(new Request(origin+path,{method:'POST',headers:{origin,'Content-Type':'application/json','x-budget-account-id':user.id},body:JSON.stringify(input)}),user),value=await response.json();if(!response.ok)throw serviceError(value.error||'הכנת הדוח לא הושלמה.',response.status);return value;};
 const active=(user,expected)=>{actor(user);if(!db.prepare('SELECT 1 FROM report_intake_privacy WHERE user_id=?').get(user.id))throw serviceError('יש לאשר אחסון דוחות לפני הכנה אוטומטית.',409);const current=policies(user).filter(p=>p.enabled);if(!current.length||expected&&JSON.stringify(current)!==JSON.stringify(expected))throw serviceError('ההכנה האוטומטית הושהתה או השתנתה. יש לפתוח לבדיקה מחדש.',409);return current;};
 const prepare=async(user,id,{retry=false}={})=>{
  actor(user);const enabled=policies(user).filter(p=>p.enabled);if(!enabled.length)return{prepared:false};
  const source=sourceRow(user,id);if(!source)throw serviceError('המקור אינו זמין בתיבה שלך.',404);
  const existing=job(user,id);if(existing&&!retry&&existing.status!=='queued'&&!(existing.status==='working'&&existing.updated_at<now()-30000))return{prepared:false,status:existing.status};
  if(running){if(!existing)write(user,id,source.source_hash,'queued',{version:1,parserVersion});return{queued:true};}
  running=true;let data={...(existing?read(existing):{}),version:1,parserVersion,message:undefined,summary:undefined,shadow:undefined};
  try{
   active(user,enabled);write(user,id,source.source_hash,'working',data);
   const original=reportStore.source('incoming:'+user.id,id);if(!original||reportHash(original.bytes)!==source.source_hash)throw Error('קובץ המקור אינו תואם לקבלה.');
   await internal(intake,user,'/api/report-intake',{action:'approve',id,sourceHash:source.source_hash,revision:source.revision,confirm:true});
   const {parsed,pages}=await readSource(original.name,original.bytes);active(user,enabled);
   if(sourceRow(user,id)?.source_hash!==source.source_hash)throw Error('קובץ המקור השתנה.');
   const identityKey=parsed.identity?reportHash(parsed.identity):'',binding=db.prepare('SELECT * FROM report_intake_bindings WHERE user_id=? AND identity_key=?').get(user.id,identityKey);
   if(!binding||!enabled.some(p=>p.budget===binding.budget)||binding.kind!==parsed.kind)throw Error('לא נמצא שיוך מזהה מאושר לתקציב שבו ההכנה האוטומטית פעילה. יש לבחור את היעד ידנית.');
   const access=budgetAccess(db,user,binding.budget,{isAllowed,write:true});if(access.role!=='owner'||!access.plan||isVault(access.plan))throw Error('תקציב היעד נעול או הרשאת הבעלים השתנתה. יש לפתוח את הדוח לבדיקה ידנית.');
   const target=(parsed.kind==='card'?creditCards(access.plan):cashAccountList(access.plan)).find(t=>t.id===binding.target);
   if(!target||parsed.provider&&(parsed.kind==='card'?target.provider:target.bankName)&&parsed.provider!==(parsed.kind==='card'?target.provider:target.bankName))throw Error('שיוך המזהה אינו תואם לחשבון הזמין.');
   if(parsed.kind==='card'&&/^\d{4}$/.test(target.alias??'')&&parsed.identity!==parsed.provider+':'+target.alias)throw Error('ספרות הכרטיס אינן תואמות לשיוך השמור.');
   const routed=await internal(intake,user,'/api/report-intake',{action:'route',id,sourceHash:source.source_hash,revision:source.revision,confirm:true,budget:binding.budget,budgetRevision:access.revision,kind:binding.kind,target:binding.target,identityKey,automatic:true,bindingRevision:binding.revision,remember:false});
   data={...data,budget:binding.budget,target:binding.target,kind:binding.kind,reportId:routed.reportId,budgetRevision:access.revision,budgetName:binding.budget==='personal'?'התקציב האישי':undefined,targetLabel:target.label??target.name,policyRevision:enabled.find(p=>p.budget===binding.budget).revision,bindingRevision:binding.revision};
   const stored=reportStore.list(access.scope).find(s=>s.id===routed.reportId);if(stored.state==='committed'){write(user,id,source.source_hash,'imported',{...data,alreadyImported:true});return{prepared:false,status:'imported'};}
   // Human edits and saved groups are authoritative. Never replace their drafts.
   const ownDraft=db.prepare('SELECT draft FROM report_sources WHERE id=? AND scope=?').get(stored.id,access.scope)?.draft;const canRefresh=retry&&stored.revision===data.sourceRevision&&ownDraft&&data.draftHash===reportHash(openReport(key(),ownDraft,access.scope+'|'+stored.id+'|draft'));
   if(!(stored.state==='received'&&stored.revision===1)&&!canRefresh)throw Error('כבר נשמרה התקדמות בדוח. יש להמשיך בבדיקה הקיימת.');
   const fresh=budgetAccess(db,user,binding.budget,{isAllowed,write:true});if(fresh.role!=='owner'||fresh.revision!==access.revision||JSON.stringify(fresh.plan)!==JSON.stringify(access.plan))throw Error('התקציב השתנה בזמן ההכנה. יש להכין הצעה חדשה.');
   const prepared=await prepareAutomaticReport(access.plan,{...parsed,hash:source.source_hash,identityKey},{id:stored.id,name:stored.name,size:original.bytes.length,revision:stored.revision,sourceHash:source.source_hash},{target:binding.target,parserVersion,budgetRevision:access.revision,asOf:new Date(now()).toISOString().slice(0,10),classifier,activityAPI});
   active(user,enabled);const final=budgetAccess(db,user,binding.budget,{isAllowed,write:true});if(final.role!=='owner'||final.revision!==access.revision||JSON.stringify(final.plan)!==JSON.stringify(access.plan))throw Error('התקציב השתנה בזמן ההכנה. ההצעה דורשת רענון.');
   await internal(reportStore,user,'/api/reports?budget='+encodeURIComponent(binding.budget)+'&id='+encodeURIComponent(stored.id),{action:'draft',id:stored.id,revision:stored.revision,draft:prepared.draft,state:prepared.status==='review'?'ready':'needs_review',kind:binding.kind,target:binding.target,month:prepared.summary.months.length===1?prepared.summary.months[0]:null});
   let noticeState='complete';try{await internal(notices,user,'/api/statement-notices?budget='+encodeURIComponent(binding.budget),{sourceId:stored.id,sourceHash:source.source_hash,revision:0,status:'complete',pages});}catch{noticeState='failed';}
   const proposedPlanHash=prepared.proposedPlan?planHash(prepared.proposedPlan):null;write(user,id,source.source_hash,prepared.status,{...data,summary:prepared.summary,shadow:prepared.shadow,proposedPlanHash,noticeState,sourceRevision:stored.revision+1,draftHash:reportHash(JSON.stringify(prepared.draft))});return{prepared:true,status:prepared.status};
  }catch(error){const current=sourceRow(user,id);if(current)write(user,id,source.source_hash,'attention',{...data,message:error.safeToExpose?error.message:error instanceof Error?error.message:'הכנת הדוח לא הושלמה.'});return{prepared:false,status:'attention'};}finally{running=false;}
 };
 const resume=async(user)=>{
  actor(user);let processed=0;
  const pending=db.prepare("SELECT intake_id FROM report_automation_jobs WHERE user_id=? AND (status='queued' OR (status='working' AND updated_at<?)) ORDER BY updated_at LIMIT 3").all(user.id,now()-30000);
  for(const row of pending){if(running||!policies(user).some(p=>p.enabled))break;await prepare(user,row.intake_id,{retry:true});processed++;}
  return {processed};
 };
 const tick=async()=>{
  if(running)return;
  const users=db.prepare("SELECT u.id,u.email,MIN(j.updated_at) oldest FROM auth_users u JOIN report_automation_jobs j ON j.user_id=u.id WHERE (j.status='queued' OR (j.status='working' AND j.updated_at<?)) AND EXISTS (SELECT 1 FROM report_automation_policies p WHERE p.user_id=u.id AND p.enabled=1) GROUP BY u.id,u.email ORDER BY oldest").all(now()-30000).filter(user=>isAllowed(user.email)).slice(0,3);
  for(const user of users){
   if(running)break;
   try{if(policies(user).some(p=>p.enabled))await resume(user);}catch{/* Revoked actors remain queued without gaining access. */}
  }
 };
 const deliver=async(user,id)=>{const result=await prepare(user,id);if(!running)await resume(user);return result;};
 const snapshot=user=>({accountId:user.id,available:true,phase:2,automaticFinancialWrites:false,parserVersion,policies:policies(user),jobs:db.prepare('SELECT * FROM report_automation_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(user.id).map(row=>{const data=read(row);let stale=false,inaccessible=false;try{if(data.budget){const access=budgetAccess(db,user,data.budget,{isAllowed});inaccessible=isVault(access.plan);const source=data.reportId?db.prepare('SELECT revision,source_hash FROM report_sources WHERE scope=? AND id=?').get(access.scope,data.reportId):null;stale=access.revision!==data.budgetRevision||!!data.reportId&&(!source||source.revision!==data.sourceRevision||source.source_hash!==row.source_hash);}}catch{inaccessible=true;}return{id:row.intake_id,status:row.status,revision:row.revision,updatedAt:row.updated_at,...(inaccessible?{message:'תקציב היעד אינו זמין לבדיקה.'}:{...data,stale:stale||data.parserVersion!==parserVersion})};})});
 const observe=(user,budget,revision)=>{actor(user);const access=budgetAccess(db,user,budget,{isAllowed});for(const row of db.prepare("SELECT * FROM report_automation_jobs WHERE user_id=? AND status IN ('review','attention','rejected')").all(user.id)){const data=read(row);if(data.budget!==budget||!data.reportId||!db.prepare("SELECT 1 FROM report_sources WHERE id=? AND scope=? AND state='committed'").get(data.reportId,access.scope))continue;write(user,row.intake_id,row.source_hash,'imported',{...data,reviewResult:{revision,comparison:revision===data.budgetRevision+1&&revision===access.revision?(planHash(access.plan)===data.proposedPlanHash?'approved_unchanged':'corrected'):'not_comparable'}});}};
 const handle=async(request,user)=>{try{actor(user);if(request.headers.get('x-budget-account-id')!==user.id)throw serviceError('החשבון השתנה.',403);if(request.method==='GET')return serviceJSON(snapshot(user));if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);const input=await boundedJSON(request);actor(user);
  if(input.action==='policy'){const access=budgetAccess(db,user,input.budget,{isAllowed,write:true});if(access.role!=='owner')throw serviceError('רק בעל התקציב יכול להפעיל הכנה אוטומטית.',403);if(typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.revision)||input.enabled&&input.confirmReadAndPrepare!==true)throw serviceError('יש לאשר קריאה אוטומטית והכנת הצעות ללא שמירה כספית.');if(input.enabled&&(!access.plan||isVault(access.plan)||!db.prepare('SELECT 1 FROM report_intake_privacy WHERE user_id=?').get(user.id)))throw serviceError('יש לפתוח תקציב ולאשר אחסון דוחות לפני הפעלה.',409);const previous=policies(user).find(p=>p.budget===input.budget);if((previous?.revision??0)!==input.revision)throw serviceError('הגדרת ההכנה השתנתה במכשיר אחר.',409);db.prepare('INSERT INTO report_automation_policies VALUES(?,?,?,1,?) ON CONFLICT(user_id,budget) DO UPDATE SET enabled=excluded.enabled,revision=report_automation_policies.revision+1,updated_at=excluded.updated_at').run(user.id,input.budget,+input.enabled,now());return serviceJSON({ok:true,revision:input.revision+1});}
  if(input.action==='resume')return serviceJSON(await resume(user));
  const row=job(user,input.id);if(!row||input.revision!==row.revision)throw serviceError('הצעת הדוח השתנתה. יש לרענן.',409);
  if(input.action==='reject'){const data=read(row);if(data.reportId&&data.budget){const access=budgetAccess(db,user,data.budget,{isAllowed});if(db.prepare("SELECT 1 FROM report_sources WHERE id=? AND scope=? AND state='committed'").get(data.reportId,access.scope))throw serviceError('הדוח כבר נקלט.',409);}if(['imported','working'].includes(row.status))throw serviceError('הדוח כבר בטיפול או נקלט.',409);write(user,input.id,row.source_hash,'rejected',{...read(row),rejectedAt:now()});return serviceJSON({ok:true});}
  if(input.action==='prepare'){active(user);if(row.status==='working'&&row.updated_at>=now()-30000)throw serviceError('הדוח עדיין בהכנה. יש להמתין ולרענן.',409);if(['imported','rejected'].includes(row.status))throw serviceError('יש לפתוח את הדוח ידנית לפני הכנה מחדש.',409);return serviceJSON(await prepare(user,input.id,{retry:true}));}
  throw serviceError('הפעולה אינה נתמכת.');
 }catch(error){return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן לעדכן את ההכנה האוטומטית.'},error.safeToExpose?error.status:503);}};
 return{handle,prepare,deliver,observe,snapshot,tick};
}
