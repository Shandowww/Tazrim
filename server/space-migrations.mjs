import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {budgetAccess,boundedJSON,serviceJSON,serviceError} from './budget-access.mjs';
import {sealReport,openReport} from './report-crypto.mjs';
import {isVault} from '../dist/server/vault.js';
import {prepareManualAccountMigration} from '../dist/server/manual-account-migration.js';
import {prepareSavingsAccountMigration} from '../dist/server/space-savings-migration.js';
import {synchronizeFinancialData} from './financial-data.mjs';
const hash=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex');
const idOK=id=>typeof id==='string'&&(id==='personal'||/^[a-zA-Z0-9-]{1,100}$/.test(id));
const uuid=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const canonicalProposal=(value,depth=0)=>{if(depth>8)throw serviceError('מבנה הצעת החסכון אינו תקין.');if(Array.isArray(value))return value.map(v=>canonicalProposal(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalProposal(value[key],depth+1)]));return value;};
export function createSpaceMigrations(db,{isAllowed,secret,now=()=>Date.now(),fault=()=>{}}={}){
 db.exec('CREATE TABLE IF NOT EXISTS private_space_migrations(user_id TEXT NOT NULL,id TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(user_id,id))');
 const aad=(user,id)=>'space-migration|'+user+'|'+id;
 const read=(user,id)=>{const row=db.prepare('SELECT data FROM private_space_migrations WHERE user_id=? AND id=?').get(user,id);return row?JSON.parse(openReport(secret(),row.data,aad(user,id))):null;};
 const store=(user,id,value)=>db.prepare('INSERT INTO private_space_migrations VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data').run(user,id,sealReport(secret(),Buffer.from(JSON.stringify(value)),aad(user,id)));
 const raw=(user,budget)=>budget==='personal'?db.prepare('SELECT data,revision,updated_at FROM plans WHERE user_id=?').get(user.id):db.prepare('SELECT data,revision,updated_at FROM budgets WHERE id=?').get(budget);
 const stamp=(user,budget)=>budget==='personal'?'personal:'+user.id:JSON.stringify({owner:db.prepare('SELECT owner_id FROM budgets WHERE id=?').get(budget)?.owner_id,members:db.prepare("SELECT m.user_id,COALESCE(r.role,'editor') role FROM budget_members m LEFT JOIN budget_member_roles r ON r.budget_id=m.budget_id AND r.user_id=m.user_id WHERE m.budget_id=? ORDER BY m.user_id").all(budget)});
 function auxiliary(scope){
  const definitions=[['report_sources','scope'],['report_connections','scope'],['wallet_events','scope'],['wallet_connections','scope'],['wallet_merchant_categories','scope'],['gmail_connections','budget'],['gmail_pending','budget'],['bank_mail_notices','budget']];
  const budget=scope.startsWith('personal:')?'personal':scope.slice(7),state=[];
  for(const [table,column]of definitions){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
   const columns=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);let actual=column;
   if(!columns.includes(actual))actual=columns.includes('budget')?'budget':columns.includes('budget_id')?'budget_id':null;
   if(actual){const privateUser=actual!=='scope'&&scope.startsWith('personal:')&&columns.includes('user_id'),rows=db.prepare('SELECT * FROM '+table+' WHERE '+actual+'=?'+(privateUser?' AND user_id=?':'')).all(...(privateUser?[budget,scope.slice(9)]:[actual==='scope'?scope:budget]));state.push([table,rows]);}
  }
  return state;
 }
 function access(user,input){
  if(input.accountId!==user.id||!idOK(input.source)||!idOK(input.target)||input.source===input.target)throw serviceError('החשבון או מרחבי המעבר אינם תקינים.',409);
  const from=budgetAccess(db,user,input.source,{isAllowed,write:true}),to=budgetAccess(db,user,input.target,{isAllowed,write:true});
  return{from,to};
 }
 function prepare(user,input){
  const {from,to}=access(user,input);
  if(!Number.isSafeInteger(input.sourceRevision)||!Number.isSafeInteger(input.targetRevision)||input.sourceRevision!==from.revision||input.targetRevision!==to.revision)throw serviceError('אחד המרחבים השתנה. רעננו והכינו סקירה חדשה.',409);
  if(!from.plan||!to.plan)throw serviceError('יש לשמור תקציב מקור ותקציב יעד לפני הכנת מעבר.');
  if(isVault(from.plan)||isVault(to.plan))throw serviceError('מעבר מוצפן עדיין חסום; אין שינוי בהצפנה.',409);
  if(typeof input.bankAccount!=='string'||input.bankAccount.length>100)throw serviceError('בחרו חשבון מקור.');
  const dateParts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now())),asOfDate=['year','month','day'].map(type=>dateParts.find(part=>part.type===type).value).join('-');
  const options={user:user.id,sourceId:input.source,targetId:input.target,accountId:input.bankAccount,sourceRevision:from.revision,targetRevision:to.revision,asOfDate};
  const prepared=input.savingsProposal!==undefined?prepareSavingsAccountMigration(from.plan,to.plan,options,canonicalProposal(input.savingsProposal)):prepareManualAccountMigration(from.plan,to.plan,options);
  const aux=[auxiliary(from.scope),auxiliary(to.scope)];
  if(aux.some(scope=>scope.some(([,rows])=>rows.length))){prepared.eligible=false;prepared.reasons.push({code:'external-records',message:'יש דוחות, תנועות או חיבורים במקור או ביעד. הם אינם מועברים במסלול הידני הראשון.'});}
  const audience=[stamp(user,input.source),stamp(user,input.target)],before=[raw(user,input.source),raw(user,input.target)];
  const token=createHmac('sha256',secret()).update(JSON.stringify([user.id,input.source,input.target,input.bankAccount,from.revision,to.revision,before.map(r=>hash(r.data)),audience,hash(aux),prepared.manifest??null])).digest('hex');
  return{...prepared,from,to,before,audience,auxHash:hash(aux),token};
 }
 function preparationResponse(user,input){const p=prepare(user,input);return serviceJSON({accountId:user.id,eligible:p.eligible,reasons:p.reasons,...(p.eligible?{reviewToken:p.token,manifest:p.manifest,targetAudienceCount:input.target==='personal'?1:1+db.prepare('SELECT COUNT(*) n FROM budget_members WHERE budget_id=?').get(input.target).n,sourceRevision:p.from.revision,targetRevision:p.to.revision}:{})});}
 function receipt(user,id,operation){
  try{access(user,operation.input);}catch{return{id,status:'unavailable',canUndo:false};}
  const current=[raw(user,operation.input.source),raw(user,operation.input.target)],unchanged=current.every((r,i)=>r.revision===operation.afterRevisions[i]&&hash(r.data)===operation.afterHashes[i]);
  return{id,status:operation.status,canUndo:operation.status==='applied'&&unchanged&&hash([auxiliary(operation.scopes[0]),auxiliary(operation.scopes[1])])===operation.auxHash,sourceRevision:current[0].revision,targetRevision:current[1].revision};
 }
 function write(user,budget,revision,data){
  const result=budget==='personal'?db.prepare('UPDATE plans SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').run(data,new Date(now()).toISOString(),user.id,revision):db.prepare('UPDATE budgets SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(data,new Date(now()).toISOString(),budget,revision);
  if(result.changes!==1)throw serviceError('אחד המרחבים השתנה. המעבר לא בוצע.',409);
 }
 function history(user,scope,revision,kind){
  // Minimal local record only: never expose a private budget snapshot or source-space ID in a shared journal.
  db.prepare('INSERT INTO plan_history(id,scope,revision,actor_id,actor_email,created_at,kind,fields,data,unavailable) VALUES(?,?,?,?,?,?,?,?,NULL,?)').run(randomUUID(),scope,revision,user.id,user.email,now(),kind,JSON.stringify(['account-migration']),'paired-migration-only');
 }
 return async(request,user)=>{try{
  if(!user||!isAllowed(user.email))throw serviceError('הגישה לחשבון אינה מורשית.',403);
  const url=new URL(request.url);
  if(request.method==='GET'){
   if(url.searchParams.get('history')==='1'){const items=db.prepare('SELECT id FROM private_space_migrations WHERE user_id=? ORDER BY rowid DESC LIMIT 100').all(user.id).map(({id})=>{const op=read(user.id,id),r=receipt(user,id,op);return{...r,...(r.status!=='unavailable'?{accountName:op.manifest.account.name}:{})};});return serviceJSON({accountId:user.id,items});}
   const id=url.searchParams.get('operation');if(id){const operation=uuid(id)&&read(user.id,id);if(!operation)throw serviceError('הפעולה אינה זמינה.',404);return serviceJSON({accountId:user.id,...receipt(user,id,operation)});}
   const input={accountId:url.searchParams.get('accountId'),source:url.searchParams.get('source'),target:url.searchParams.get('target'),bankAccount:url.searchParams.get('bankAccount'),sourceRevision:Number(url.searchParams.get('sourceRevision')),targetRevision:Number(url.searchParams.get('targetRevision'))};
   return preparationResponse(user,input);
  }
  if(request.method!=='POST')throw serviceError('הפעולה אינה נתמכת.',405);
  const input=await boundedJSON(request,1048576);
  if(input?.savingsProposal===undefined&&JSON.stringify(input).length>8192)throw serviceError('בקשת המעבר גדולה מדי.',413);
  if(input?.action==='prepare-savings'){
   if(input.accountId!==user.id||!input.savingsProposal||Object.keys(input).some(k=>!['accountId','source','target','bankAccount','sourceRevision','targetRevision','savingsProposal','action'].includes(k)))throw serviceError('בקשת סקירת החסכון אינה תקינה.');
   return preparationResponse(user,input);
  }
  if(!uuid(input?.operation)||!['apply','undo'].includes(input.action)||input.accountId!==user.id)throw serviceError('בקשת המעבר אינה תקינה.');
  db.exec('BEGIN IMMEDIATE');try{
   let op=read(user.id,input.operation);
   if(input.action==='apply'){
    const signature=hash([input.accountId,input.source,input.target,input.bankAccount,input.sourceRevision,input.targetRevision,input.reviewToken,input.confirmedPrivacy,input.confirmedMove,input.operation,input.action,...(input.savingsProposal!==undefined?[canonicalProposal(input.savingsProposal)]:[])]);if(op){if(op.requestHash!==signature)throw serviceError('מזהה הפעולה כבר שימש לבקשה אחרת.',409);access(user,op.input);db.exec('COMMIT');return serviceJSON({accountId:user.id,...receipt(user,input.operation,op),replayed:true});}
    if(input.confirmedPrivacy!==true||input.confirmedMove!==true)throw serviceError('יש לאשר את פרטי המעבר וחשיפתם ליעד.');
    const p=prepare(user,input);if(!p.eligible)throw serviceError('המעבר חסום בגלל תלות שלא נפתרה. הכינו סקירה חדשה.',409);
    if(typeof input.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewToken)||!timingSafeEqual(Buffer.from(input.reviewToken,'hex'),Buffer.from(p.token,'hex')))throw serviceError('הסקירה, ההרשאות או נתוני המקור השתנו. הכינו סקירה חדשה.',409);
    if(db.prepare('SELECT COUNT(*) n FROM private_space_migrations WHERE user_id=?').get(user.id).n>=100)throw serviceError('מגבלת יומן המעברים הושגה. לא בוצע מעבר.',409);
    const after=[JSON.stringify(p.sourceAfter),JSON.stringify(p.targetAfter)];
    write(user,input.source,p.from.revision,after[0]);fault('after-source');write(user,input.target,p.to.revision,after[1]);fault('after-target');
    synchronizeFinancialData(db);fault('after-projections');
    history(user,p.from.scope,p.from.revision+1,'account-migration');history(user,p.to.scope,p.to.revision+1,'account-migration');
    op={input:{accountId:user.id,source:input.source,target:input.target},scopes:[p.from.scope,p.to.scope],requestHash:signature,before:p.before,afterRevisions:[p.from.revision+1,p.to.revision+1],afterHashes:after.map(hash),auxHash:p.auxHash,status:'applied',manifest:p.manifest};store(user.id,input.operation,op);fault('after-journal');
   }else{
    if(!op)throw serviceError('פעולת המעבר אינה זמינה.',404);access(user,op.input);
    if(op.status==='undone'){db.exec('COMMIT');return serviceJSON({accountId:user.id,...receipt(user,input.operation,op),replayed:true});}
    const r=receipt(user,input.operation,op);if(input.confirmedUndo!==true||!r.canUndo||input.sourceRevision!==r.sourceRevision||input.targetRevision!==r.targetRevision)throw serviceError('אין לבטל אחרי שינוי במרחבים או בנתונים הנלווים. לא בוצע שינוי.',409);
    write(user,op.input.source,r.sourceRevision,op.before[0].data);fault('undo-after-source');write(user,op.input.target,r.targetRevision,op.before[1].data);synchronizeFinancialData(db);fault('undo-after-projections');
    history(user,op.scopes[0],r.sourceRevision+1,'account-migration-undo');history(user,op.scopes[1],r.targetRevision+1,'account-migration-undo');op.status='undone';store(user.id,input.operation,op);fault('undo-after-journal');
   }
   db.exec('COMMIT');return serviceJSON({accountId:user.id,...receipt(user,input.operation,op)});
  }catch(error){db.exec('ROLLBACK');throw error;}
 }catch(error){if(!error.status)console.error('Atomic account migration failed');return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן לאשר את הפעולה. רעננו ובדקו את מצב הפעולה לפני ניסיון נוסף.'},error.status??500);}};
}
