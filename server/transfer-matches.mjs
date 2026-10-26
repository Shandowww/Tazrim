import {randomUUID,createHash} from 'node:crypto';
import {budgetAccess,boundedJSON,serviceJSON,serviceError} from './budget-access.mjs';
import {sealReport,openReport} from './report-crypto.mjs';
import {transferLegs,transferRefsEqual,transferPairValid} from '../dist/server/transfer-matching-model.js';
import {isVault} from '../dist/server/vault.js';
const refOK=r=>r&&Object.keys(r).sort().join(',')==='budget,fingerprint,key,revision'&&typeof r.budget==='string'&&(r.budget==='personal'||/^[a-zA-Z0-9-]{1,100}$/.test(r.budget))&&/^[a-f0-9]{64}$/.test(r.key)&&/^[a-f0-9]{64}$/.test(r.fingerprint)&&Number.isSafeInteger(r.revision)&&r.revision>=0;
const plainToken=(user,ref)=>createHash('sha256').update(JSON.stringify([user,ref.budget,ref.key])).digest('hex');
const sealedFormat='monthly-flow-sealed-transfer-v1';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function sealedSourceOK(s){
 if(!s||typeof s.budget!=='string'||!(s.budget==='personal'||/^[a-zA-Z0-9-]{1,100}$/.test(s.budget))||!Number.isSafeInteger(s.revision)||s.revision<0||!/^[a-f0-9]{64}$/.test(s.token))return false;
 const fields=s.keyId?'budget,context,keyId,revision,token':'budget,revision,token';
 return Object.keys(s).sort().join(',')===fields&&(!s.keyId||uuid(s.keyId)&&typeof s.context==='string'&&s.context.length>0&&s.context.length<=300);
}
function sealedOK(m){
 if(!m||Object.keys(m).sort().join(',')!=='box,format,id,sources'||m.format!==sealedFormat||!uuid(m.id)||!Array.isArray(m.sources)||m.sources.length!==2||!m.sources.every(sealedSourceOK)||m.sources[0].budget===m.sources[1].budget||!m.sources.some(s=>s.keyId))return false;
 const box=m.box;
 return !!box&&Object.keys(box).sort().join(',')==='data,iv'&&typeof box.iv==='string'&&/^[A-Za-z0-9+/]{16}$/.test(box.iv)&&typeof box.data==='string'&&box.data.length<=8192&&box.data.length>=24&&Buffer.from(box.data,'base64').toString('base64')===box.data;
}
export function createTransferMatches(db,{isAllowed,secret,now=()=>Date.now()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS private_transfer_matches(user_id TEXT NOT NULL,id TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(user_id,id));
 CREATE TABLE IF NOT EXISTS private_transfer_match_state(user_id TEXT PRIMARY KEY,revision INTEGER NOT NULL);`);
 const aad=(user,id)=>'transfer-match|'+user+'|'+id;
 const read=user=>db.prepare('SELECT id,data FROM private_transfer_matches WHERE user_id=? ORDER BY id').all(user).map(r=>({id:r.id,...JSON.parse(openReport(secret(),r.data,aad(user,r.id)))}));
 const revision=user=>db.prepare('SELECT revision FROM private_transfer_match_state WHERE user_id=?').get(user)?.revision??0;
 function leg(user,ref){
  if(!refOK(ref))throw serviceError('הפניה לתנועת מקור אינה תקינה.');
  const access=budgetAccess(db,user,ref.budget,{isAllowed});
  if(access.revision!==ref.revision)throw serviceError('נתוני המקור השתנו. רעננו ובדקו שוב את שתי התנועות.',409);
  if(isVault(access.plan))throw serviceError('יש לפתוח את המקור במכשיר ולשלוח התאמה מוצפנת בלבד.',409);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(now());
  const found=access.plan&&transferLegs(access.plan,user.id,ref.budget,access.revision,date).find(l=>transferRefsEqual(l.ref,ref));
  if(!found)throw serviceError('תנועת המקור הוסרה או סווגה מחדש. רעננו ובדקו שוב.',409);
  return found;
 }
 function sealedSources(user,sealed){
  if(!sealedOK(sealed))throw serviceError('התאמה מוצפנת אינה בפורמט תקין.');
  for(const source of sealed.sources){
   const access=budgetAccess(db,user,source.budget,{isAllowed});
   if(access.revision!==source.revision)throw serviceError('נתוני המקור השתנו. רעננו ובדקו שוב.',409);
   if(source.keyId){if(!isVault(access.plan)||access.plan.keyId!==source.keyId||access.plan.context!==source.context)throw serviceError('מפתח או הקשר ההצפנה השתנו.',409);}
   else{
    if(isVault(access.plan))throw serviceError('המקור הוצפן. יש לפתוח ולבדוק שוב במכשיר.',409);
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(now());
    if(!access.plan||!transferLegs(access.plan,user.id,source.budget,access.revision,date).some(l=>plainToken(user.id,l.ref)===source.token))throw serviceError('תנועת המקור אינה זמינה.',409);
   }
  }
 }
 const tokens=(user,m)=>m.sealed?.sources??[m.out,m.in].filter(Boolean).map(ref=>({budget:ref.budget,token:plainToken(user,ref)}));
 function snapshot(user){
  const items=read(user.id).map(m=>{try{if(m.sealed){sealedSources(user,m.sealed);return{id:m.id,sealed:m.sealed,status:'sealed'};}return transferPairValid(leg(user,m.out),leg(user,m.in))?{...m,status:'current'}:{id:m.id,status:'unavailable'};}catch(error){if(![400,403,404,409].includes(error.status))throw error;return{id:m.id,status:'unavailable'};}});
  return {accountId:user.id,revision:revision(user.id),items};
 }
 return async(request,user)=>{try{
  if(!user||!isAllowed(user.email))throw serviceError('הגישה לחשבון אינה מורשית.',403);
  if(request.method==='GET')return serviceJSON(snapshot(user));
  if(!['POST','DELETE'].includes(request.method))return serviceJSON({error:'הפעולה אינה נתמכת.'},405);
  const input=await boundedJSON(request,16384);
  db.exec('BEGIN IMMEDIATE');try{
   if(input?.accountId!==user.id)throw serviceError('החשבון המחובר השתנה. יש לרענן לפני עדכון התאמות.',409);
   if(!Number.isSafeInteger(input?.revision)||input.revision!==revision(user.id))throw serviceError('רשימת ההתאמות השתנתה במכשיר אחר. רעננו ונסו שוב.',409);
   if(request.method==='POST'){
    if(input.confirmed!==true)throw serviceError('יש לאשר במפורש את שתי התנועות.');
    let id,payload;
    if(input.sealed){
     if(Object.keys(input).sort().join(',')!=='accountId,confirmed,revision,sealed')throw serviceError('אין לשלוח הפניות מפוענחות עם התאמה מוצפנת.');
     sealedSources(user,input.sealed);id=input.sealed.id;payload={sealed:input.sealed};
    }else{
     if(!transferPairValid(leg(user,input.out),leg(user,input.in)))throw serviceError('יש לאשר חיוב וזיכוי בסכום זהה בשני מרחבים שונים.');
     id=randomUUID();payload={out:input.out,in:input.in};
    }
    const stored=read(user.id);if(stored.length>=200)throw serviceError('ניתן לשמור עד 200 התאמות. הסירו התאמה ישנה לפני הוספה.');
    const proposed=tokens(user.id,payload);
    if(stored.some(m=>m.id===id||tokens(user.id,m).some(a=>proposed.some(b=>a.budget===b.budget&&a.token===b.token))))throw serviceError('אחת התנועות כבר מקושרת בהתאמה פרטית. הסירו אותה לפני קישור חדש.',409);
    const data=sealReport(secret(),Buffer.from(JSON.stringify(payload)),aad(user.id,id));
    db.prepare('INSERT INTO private_transfer_matches VALUES(?,?,?)').run(user.id,id,data);
   }else{
    if(typeof input.id!=='string'||!db.prepare('DELETE FROM private_transfer_matches WHERE user_id=? AND id=?').run(user.id,input.id).changes)throw serviceError('ההתאמה אינה זמינה.',404);
   }
   db.prepare('INSERT INTO private_transfer_match_state VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1').run(user.id);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return serviceJSON(snapshot(user),request.method==='POST'?201:200);
 }catch(error){if(!error.status)console.error('Private transfer matching failed');return serviceJSON({error:error.safeToExpose?error.message:'לא ניתן לשמור או לטעון התאמות כרגע. נסו לרענן.'},error.status??500);}};
}
