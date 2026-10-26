import {budgetAccess,serviceJSON,serviceError} from './budget-access.mjs';
import {cashAccountList,validatePlan} from '../dist/server/budget.js';
import {isVault} from '../dist/server/vault.js';
import {reviewAccountMigration} from '../dist/server/space-migration-model.js';
export function createSpaceMigrationReview(db,{isAllowed}={}){
 const count=(table,where,...args)=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)?db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE '+where).get(...args).n:0;
 return async(request,user)=>{try{
  if(request.method!=='GET')throw serviceError('סקירת מעבר היא לקריאה בלבד. לא בוצע שינוי.',405);
  const url=new URL(request.url),sourceId=url.searchParams.get('source')??'personal',targetId=url.searchParams.get('target');
  if(!targetId||sourceId===targetId||[sourceId,targetId].some(id=>id.length>100||!(id==='personal'||/^[a-zA-Z0-9-]+$/.test(id))))throw serviceError('בחרו מרחב מקור ויעד שונים.');
  // A review cannot imply permission to move records for a viewer.
  const source=budgetAccess(db,user,sourceId,{isAllowed,write:true}),target=budgetAccess(db,user,targetId,{isAllowed,write:true});
  if(isVault(source.plan)||isVault(target.plan))return serviceJSON({error:'מעבר של מרחב מוצפן מחייב הכנת תוצאה והצפנה מחדש במכשיר ושמירה אטומית. מסלול המעבר טרם זמין; ההצפנה נשמרת.',code:'encrypted-migration-unavailable'},409);
  if(!source.plan||!validatePlan(source.plan)||target.plan&&!validatePlan(target.plan))throw serviceError('יש לטעון תקציב מקור שמור ותקציב יעד שמור ותקין לפני סקירה.');
  if(!target.plan)throw serviceError('היעד עדיין ריק. הגדירו ושמרו אותו לפני סקירת מעבר.');
  const accountId=url.searchParams.get('account'),base={accountId:user.id,sourceRevision:source.revision,targetRevision:target.revision,accounts:cashAccountList(source.plan).map(a=>({id:a.id,name:a.label})),audience:{targetMembers:targetId==='personal'?1:1+count('budget_members','budget_id=?',targetId),targetPrivate:targetId==='personal'}};
  if(!accountId)return serviceJSON(base);
  for(const [name,revision] of [['sourceRevision',source.revision],['targetRevision',target.revision]]){const raw=url.searchParams.get(name);if(!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)!==revision)throw serviceError('אחד המרחבים השתנה. רעננו את הסקירה ובחרו מחדש.',409);}
  if(accountId.length>100||!base.accounts.some(a=>a.id===accountId))throw serviceError('חשבון המקור אינו זמין.');
  const review=reviewAccountMigration(source.plan,target.plan,{user:user.id,sourceId,targetId,accountId,sourceRevision:source.revision,targetRevision:target.revision});
  const external={originalReports:count('report_sources','scope=?',source.scope),reportDrafts:count('report_sources','scope=? AND draft IS NOT NULL',source.scope),historyEntries:count('plan_history','scope=?',source.scope),ownPrivateMatches:count('private_transfer_matches','user_id=?',user.id),ownImportConnections:count('report_connections','user_id=? AND budget=? AND revoked=0',user.id,sourceId),ownWalletConnections:count('wallet_connections','user_id=? AND budget_id=? AND revoked=0',user.id,sourceId),ownGmailConnections:count('gmail_connections','user_id=? AND budget=?',user.id,sourceId)};
  return serviceJSON({...base,review,external});
 }catch(error){if(!error.status)console.error('Migration review failed');return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן להכין סקירה כרגע. המרחבים לא שונו.'},error.status??500);}};
}
