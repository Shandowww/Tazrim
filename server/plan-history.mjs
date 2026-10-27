import {randomUUID} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {budgetAccess,boundedJSON,serviceJSON,serviceError} from './budget-access.mjs';
import {sealReport,openReport} from './report-crypto.mjs';
import {isVault} from '../dist/server/vault.js';
const cap=4*1024*1024;
const wrappers=value=>{const next={...value};delete next.encrypted;return JSON.stringify(next);};
export function createPlanHistory(db,{isAllowed,secret,savePlan,now=()=>Date.now(),maxBytes=cap}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS plan_history(id TEXT PRIMARY KEY,scope TEXT NOT NULL,revision INTEGER NOT NULL,actor_id TEXT NOT NULL,actor_email TEXT NOT NULL,created_at INTEGER NOT NULL,kind TEXT NOT NULL,fields TEXT NOT NULL,data BLOB,unavailable TEXT,UNIQUE(scope,revision));CREATE INDEX IF NOT EXISTS plan_history_scope ON plan_history(scope,revision DESC);`);
 const open=row=>JSON.parse(inflateRawSync(openReport(secret(),row.data,'history|'+row.scope+'|'+row.id),{maxOutputLength:20000000}));
 function storage(DB,user,budget='personal',kind='save'){
  return DB.withPlanAudit(()=>{
   const before=budgetAccess(db,user,budget,{write:true,isAllowed});
   return()=>{
    const after=budgetAccess(db,user,budget,{write:true,isAllowed});if(after.revision===before.revision)return;
    const id=randomUUID(),fields=isVault(after.plan)||isVault(before.plan)?['encrypted-budget']:Object.keys({...before.plan,...after.plan}).filter(k=>JSON.stringify(before.plan?.[k])!==JSON.stringify(after.plan?.[k])).slice(0,100).map(key=>key.length<=80?key:'other');
    let data=null,unavailable=null;
    // Missing deployment recovery configuration must not prevent ordinary saves.
    // Once configured, any other encryption/SQL failure rolls back the save.
    try{const raw=Buffer.from(JSON.stringify({before:before.plan,after:after.plan}));if(raw.length>20000000)unavailable='capacity';else{const packed=deflateRawSync(raw);if(packed.length+28>maxBytes-db.prepare('SELECT COALESCE(SUM(length(data)),0) AS n FROM plan_history').get().n)unavailable='capacity';else data=sealReport(secret(),packed,'history|'+after.scope+'|'+id);}}catch(e){if(e.code==='ENOENT')unavailable='recovery-configuration';else throw e;}
    db.prepare('INSERT INTO plan_history VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,after.scope,after.revision,user.id,user.email,now(),(isVault(before.plan)||isVault(after.plan))&&wrappers(before.plan)!==wrappers(after.plan)?'encryption':kind,JSON.stringify(fields),data,unavailable);
   };
  });
 }
 const eligible=(row,access)=>!!row.data&&row.revision===access.revision&&!['report-import','encryption'].includes(row.kind);
 async function handle(request,user){try{
  const boundActor=request.headers.get('x-budget-account-id');if(boundActor!==null&&boundActor!==user.id)throw serviceError('החשבון השתנה. יש לפתוח מחדש את יומן השינויים.',403);
  const url=new URL(request.url),budget=url.searchParams.get('budget')||'personal',access=budgetAccess(db,user,budget,{isAllowed,write:request.method!=='GET'}),id=url.searchParams.get('id');
  if(request.method==='GET'){
   if(id){const row=db.prepare('SELECT * FROM plan_history WHERE id=? AND scope=?').get(id,access.scope);if(!row)throw serviceError('השינוי אינו זמין בתקציב הזה.',404);if(!row.data)throw serviceError('נשמר רישום השינוי, אך אין עותק לביטול.',409);const value=open(row);if(isVault(access.plan)&&(!isVault(value.before)||!isVault(value.after)))throw serviceError('היסטוריה גלויה מלפני ההצפנה אינה נפתחת בתקציב מוצפן.',409);return serviceJSON({...value,undoIdentityBound:true,revision:row.revision,canUndo:eligible(row,access)&&!!value.before});}
   const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw serviceError('עמוד לא תקין.');
   const rows=db.prepare('SELECT * FROM plan_history WHERE scope=? ORDER BY revision DESC LIMIT 21 OFFSET ?').all(access.scope,offset);return serviceJSON({revision:access.revision,next:rows.length>20?offset+20:null,entries:rows.slice(0,20).map(row=>({id:row.id,revision:row.revision,actor:row.actor_email,at:row.created_at,kind:row.kind,fields:isVault(access.plan)?['encrypted-budget']:JSON.parse(row.fields),snapshot:!!row.data,unavailable:row.unavailable,canUndo:access.role!=='viewer'&&eligible(row,access)}))});
  }
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  const input=await boundedJSON(request),row=db.prepare('SELECT * FROM plan_history WHERE id=? AND scope=?').get(input.id,access.scope);
  if(input.action!=='undo'||!row||input.revision!==access.revision||!eligible(row,access))throw serviceError('ניתן לבטל רק את השמירה האחרונה. רעננו את היומן ובדקו שוב.',409);
  const previous=open(row).before;if(!previous)throw serviceError('אין תקציב קודם לשחזור.');
  if(isVault(access.plan)&&(!isVault(previous)||previous.context!==access.plan.context||previous.keyId!==access.plan.keyId||wrappers(previous)!==wrappers(access.plan)))throw serviceError('ביטול אינו משנה או מסיר את הגנת ההצפנה.',409);
  return await savePlan(user,budget,previous,access.revision,'undo');
 }catch(e){return serviceJSON({error:e.safeToExpose?e.message:'יומן השינויים אינו זמין כרגע. התקציב לא שונה.'},e.safeToExpose?e.status:503);}}
 return{storage,handle};
}
