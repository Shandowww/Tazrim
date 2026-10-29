import {budgetAccess,serviceJSON,boundedJSON,serviceError} from './budget-access.mjs';
export function createActions(db,{isAllowed,now=()=>Date.now(),reports=()=>[],isAdmin=()=>false}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS action_preferences(user_id TEXT NOT NULL,scope TEXT NOT NULL,issue_key TEXT NOT NULL,evidence TEXT NOT NULL,until INTEGER NOT NULL,PRIMARY KEY(user_id,scope,issue_key));
 CREATE TABLE IF NOT EXISTS report_expectations(scope TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);`);
 return async(request,user)=>{try{
 const budget=new URL(request.url).searchParams.get('budget')??'personal',access=budgetAccess(db,user,budget,{isAllowed}),{scope}=access;
 if(request.method==='GET'){const row=db.prepare('SELECT revision,data FROM report_expectations WHERE scope=?').get(scope);return serviceJSON({accountId:user.id,accountEmail:user.email,budgetId:budget,actionIdentityBound:true,actionPreferenceCAS:true,backupAdmin:!!isAdmin(user),preferences:Object.fromEntries(db.prepare('SELECT issue_key,evidence,until FROM action_preferences WHERE user_id=? AND scope=?').all(user.id,scope).map(r=>[r.issue_key,{evidence:r.evidence,until:r.until}])),expectations:row?JSON.parse(row.data):[],revision:row?.revision??0,reports:reports(scope)});}
 if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
 const input=await boundedJSON(request);
 if(Object.hasOwn(input,'accountId')&&input.accountId!==user.id)throw serviceError('החשבון השתנה. יש לפתוח את הפעולה מחדש בחשבון המקורי.',403);
 if(input.action==='expectations'){
  budgetAccess(db,user,budget,{write:true,isAllowed});
  if(!Number.isSafeInteger(input.revision)||input.revision<0||!Array.isArray(input.rules)||input.rules.length>40)throw serviceError('יש לבדוק את הגדרות הדוחות.');
  const seen=new Set();for(const r of input.rules){const key=r?.kind+':'+r?.target;if(!r||!['bank','card'].includes(r.kind)||typeof r.target!=='string'||!/^[\w-]{1,100}$/.test(r.target)||seen.has(key)||typeof r.enabled!=='boolean'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.startMonth)||!Number.isInteger(r.dueDay)||r.dueDay<1||r.dueDay>31||!Number.isInteger(r.graceDays)||r.graceDays<0||r.graceDays>31||!Array.isArray(r.exceptions)||r.exceptions.length>120||r.exceptions.some(m=>!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)))throw serviceError('יש לבדוק מועד, מקור ותקופה.');seen.add(key);if(Object.keys(r).some(k=>!['kind','target','enabled','startMonth','dueDay','graceDays','exceptions'].includes(k)))throw serviceError('שדה שאינו נתמך.');}
  db.exec('BEGIN IMMEDIATE');try{const current=db.prepare('SELECT revision FROM report_expectations WHERE scope=?').get(scope)?.revision??0;if(current!==input.revision)throw serviceError('ההגדרות השתנו. רעננו לפני שמירה.',409);db.prepare('INSERT INTO report_expectations VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(scope,current+1,JSON.stringify(input.rules));db.exec('COMMIT');return serviceJSON({revision:current+1});}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(typeof input.key!=='string'||input.key.length>400||typeof input.evidence!=='string'||input.evidence.length>2048||!Number.isSafeInteger(input.until)||(input.action!=='read'&&(input.until<now()||input.until>now()+7*86400000))||(input.action==='read'&&input.until!==0))throw serviceError('התזכורת אינה תקינה.');
 const compare=Object.hasOwn(input,'previous');
 if(compare&&input.previous!==null&&(!input.previous||typeof input.previous!=='object'||Array.isArray(input.previous)||Object.keys(input.previous).sort().join(',')!=='evidence,until'||typeof input.previous.evidence!=='string'||!Number.isSafeInteger(input.previous.until)))throw serviceError('מצב התזכורת הקודם אינו תקין.');
 db.exec('BEGIN IMMEDIATE');try{
 const current=db.prepare('SELECT evidence,until FROM action_preferences WHERE user_id=? AND scope=? AND issue_key=?').get(user.id,scope,input.key);
 if(compare&&(input.previous===null?!!current:!current||current.evidence!==input.previous.evidence||current.until!==input.previous.until))throw serviceError('התזכורת השתנתה במכשיר אחר. רעננו לפני עדכון.',409);
 db.prepare('DELETE FROM action_preferences WHERE until>0 AND until<=?').run(now());if(db.prepare('SELECT COUNT(*) AS n FROM action_preferences WHERE user_id=?').get(user.id).n>=1000&&!db.prepare('SELECT 1 FROM action_preferences WHERE user_id=? AND scope=? AND issue_key=?').get(user.id,scope,input.key))throw serviceError('רשימת התזכורות מלאה.',429);
 db.prepare('INSERT INTO action_preferences VALUES(?,?,?,?,?) ON CONFLICT(user_id,scope,issue_key) DO UPDATE SET evidence=excluded.evidence,until=excluded.until').run(user.id,scope,input.key,input.evidence,input.until);db.exec('COMMIT');return serviceJSON({ok:true});
 }catch(e){db.exec('ROLLBACK');throw e;}
 }catch(e){return serviceJSON({error:e.safeToExpose?e.message:'לא ניתן לעדכן את הפעולות כרגע.'},e.safeToExpose?e.status:503);}};
}
