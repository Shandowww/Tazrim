import {isVault} from './vault.js';
import {validatePlan} from './budget.js';
import {budgetSpaceScope} from './space-model.js';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const identifier=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const nameOK=name=>typeof name==='string'&&name.trim().length>0&&name.trim().length<=40;
const normalizeEmail=email=>typeof email==='string'?email.trim().toLowerCase():'';
const digest=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
export async function handleSpaces(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/budgets')&&!(path==='/api/plan'&&url.searchParams.has('budget')&&url.searchParams.get('budget')!=='personal'))return null;
 const user=request.headers.get('oai-authenticated-user-id'),email=normalizeEmail(request.headers.get('oai-authenticated-user-email'));
 if(!user||!email)return reply({error:'יש להיכנס כדי לגשת לתקציבים.'},401);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return reply({error:'מקור הבקשה אינו תקין.'},403);
 const DB=env.DB;try{
 let body=null;if(!['GET','HEAD','DELETE'].includes(request.method)){const text=await request.text();if(text.length>9000000)return reply({error:'הנתונים גדולים מדי.'},413);try{body=JSON.parse(text);}catch{return reply({error:'הנתונים אינם תקינים.'},400);}}
 if(path==='/api/budgets'&&request.method==='GET'){
  const result=await DB.prepare('SELECT b.id,b.name,b.revision, CASE WHEN b.owner_id=? THEN \'owner\' ELSE COALESCE((SELECT r.role FROM budget_member_roles r WHERE r.budget_id=b.id AND r.user_id=(SELECT m.user_id FROM budget_members m WHERE m.budget_id=b.id AND m.user_id=?)),\'editor\') END AS role FROM budgets b WHERE b.owner_id=? OR EXISTS (SELECT 1 FROM budget_members m WHERE m.budget_id=b.id AND m.user_id=?) ORDER BY b.name,b.id LIMIT 100').bind(user,user,user,user).all();
  const personal=await DB.prepare('SELECT revision FROM plans WHERE user_id=?').bind(user).first();
  return reply({budgets:[{id:'personal',name:'האישי שלי',role:'owner',revision:personal?.revision??0,hasData:!!personal},...result.results].map(space=>({...space,scope:budgetSpaceScope(user,space.id)})),accountEmail:email,accountId:user});
 }
 if(path==='/api/budgets'&&request.method==='POST'){
  if(!nameOK(body?.name))return reply({error:'יש להזין שם תקציב, עד 40 תווים.'},400);
  const id=crypto.randomUUID(),name=body.name.trim();const r=await DB.prepare('INSERT INTO budgets (id,owner_id,name,updated_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM budgets WHERE owner_id=?)<20 AND NOT EXISTS (SELECT 1 FROM budgets WHERE owner_id=? AND lower(trim(name))=lower(?))').bind(id,user,name,new Date().toISOString(),user,user,name).run();
  if(!r.meta.changes&&await DB.prepare('SELECT id FROM budgets WHERE owner_id=? AND lower(trim(name))=lower(?)').bind(user,name).first())return reply({error:'כבר יש לך תקציב בשם הזה. אפשר לפתוח אותו ברשימת התקציבים או לבחור שם אחר.'},409);
  return r.meta.changes?reply({id,name:body.name.trim(),role:'owner'},201):reply({error:'ניתן ליצור עד 20 תקציבים.'},400);
 }
 if(path==='/api/budgets/accept'&&request.method==='POST'){
  if(typeof body?.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return reply({error:'ההזמנה אינה תקינה.'},400);
  const hash=await digest(body.token),now=new Date().toISOString();
  const invite=await DB.prepare('SELECT budget_id FROM budget_invitations WHERE hash=? AND email=? AND expires_at>? AND accepted_user IS NULL').bind(hash,email,now).first();
  if(!invite)return reply({error:'ההזמנה פגה, בוטלה, נוצלה או מיועדת לכתובת אחרת. יש להתחבר עם הכתובת שהוזמנה או לבקש הזמנה חדשה.'},403);
  const r=await DB.prepare('INSERT INTO budget_members (budget_id,user_id,email) SELECT budget_id,?,? FROM budget_invitations WHERE hash=? AND email=? AND expires_at>? AND accepted_user IS NULL ON CONFLICT(budget_id,user_id) DO NOTHING').bind(user,email,hash,email,now).run();
  if(!r.meta.changes)return reply({error:'כבר הצטרפת לתקציב, או שההזמנה אינה זמינה.'},409);
  await DB.prepare("INSERT INTO budget_member_roles(budget_id,user_id,role) SELECT budget_id,?,COALESCE((SELECT role FROM budget_invitation_roles WHERE hash=?),'editor') FROM budget_invitations WHERE hash=? ON CONFLICT(budget_id,user_id) DO UPDATE SET role=excluded.role").bind(user,hash,hash).run();
  await DB.prepare('UPDATE budget_invitations SET accepted_user=? WHERE hash=? AND accepted_user IS NULL').bind(user,hash).run();
  return reply({id:invite.budget_id});
 }
 const parts=path.split('/'),id=path==='/api/plan'?url.searchParams.get('budget'):parts[3];
 if(!identifier(id))return reply({error:'התקציב לא נמצא.'},404);
 const row=await DB.prepare('SELECT b.* FROM budgets b WHERE b.id=? AND (b.owner_id=? OR EXISTS (SELECT 1 FROM budget_members m WHERE m.budget_id=b.id AND m.user_id=?))').bind(id,user,user).first();
 if(!row)return reply({error:'התקציב אינו זמין לחשבון הזה.'},404);
 const memberRole=row.owner_id===user?'owner':(await DB.prepare('SELECT role FROM budget_member_roles WHERE budget_id=? AND user_id=?').bind(id,user).first())?.role??'editor';
 if(path==='/api/plan'){
  if(request.method==='GET')return reply({plan:row.data?JSON.parse(row.data):null,revision:row.revision,accountEmail:email,accountId:user,writeIdentityBound:true,budget:{id,name:row.name,role:memberRole,scope:budgetSpaceScope(user,id)}});
  if(request.method==='PUT'){
   if(body?.accountId!==undefined&&body.accountId!==user)return reply({error:'החשבון השתנה מאז פתיחת הטיוטה. יש להיכנס לחשבון המקורי לפני שמירה.'},403);
   if(memberRole==='viewer')return reply({error:'התקציב פתוח לצפייה בלבד.'},403);
   if(!(validatePlan(body?.plan)||isVault(body?.plan))||!Number.isInteger(body.revision)||body.revision<0)return reply({error:'יש לבדוק את נתוני התקציב.'},400);
   if(isVault(body.plan)&&body.plan.context!==id)return reply({error:'התקציב המוצפן שייך לתקציב אחר.'},400);
   const old=row.data?JSON.parse(row.data):null;if(isVault(old)&&!isVault(body.plan))return reply({error:'אין להחליף תקציב מוצפן בתקציב גלוי.'},400);
   if(row.owner_id!==user&&((isVault(old)!==isVault(body.plan))||(isVault(old)&&(old.keyId!==body.plan.keyId||old.salt!==body.plan.salt||JSON.stringify(old.wrapped)!==JSON.stringify(body.plan.wrapped)||JSON.stringify(old.recovery)!==JSON.stringify(body.plan.recovery)))))return reply({error:'רק בעל התקציב יכול לשנות את ההצפנה.'},403);
   const r=await DB.prepare('UPDATE budgets SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (owner_id=? OR EXISTS (SELECT 1 FROM budget_members m WHERE m.budget_id=budgets.id AND m.user_id=? AND NOT EXISTS(SELECT 1 FROM budget_member_roles r WHERE r.budget_id=m.budget_id AND r.user_id=m.user_id AND r.role=\'viewer\')))').bind(JSON.stringify(body.plan),new Date().toISOString(),id,body.revision,user,user).run();
   return r.meta.changes?reply({revision:body.revision+1}):reply({error:'התקציב השתנה במכשיר אחר או שהגישה הוסרה. ייצאו גיבוי לפני רענון.'},409);
  }
 }
 if(row.owner_id!==user)return reply({error:'רק בעל התקציב יכול לנהל את המשתתפים ואת השם.'},403);
 if(parts.length===4&&request.method==='PATCH'){
  if(!nameOK(body?.name))return reply({error:'יש להזין שם תקציב, עד 40 תווים.'},400);
  await DB.prepare('UPDATE budgets SET name=? WHERE id=? AND owner_id=?').bind(body.name.trim(),id,user).run();return reply({name:body.name.trim()});
 }
 if(parts[4]==='members'&&request.method==='GET'){
  const members=await DB.prepare('SELECT m.user_id AS id,m.email,COALESCE(r.role,\'editor\') AS role FROM budget_members m LEFT JOIN budget_member_roles r ON r.budget_id=m.budget_id AND r.user_id=m.user_id WHERE m.budget_id=? ORDER BY m.email').bind(id).all();
  const invites=await DB.prepare('SELECT hash AS id,email,expires_at AS expiresAt FROM budget_invitations WHERE budget_id=? AND accepted_user IS NULL AND expires_at>? ORDER BY email').bind(id,new Date().toISOString()).all();
  return reply({members:members.results,invitations:invites.results});
 }
 if(parts[4]==='members'&&parts[5]&&request.method==='PATCH'){
  if(!['viewer','editor'].includes(body?.role))return reply({error:'יש לבחור הרשאה תקינה.'},400);
  const memberId=decodeURIComponent(parts[5]);if(!await DB.prepare('SELECT user_id FROM budget_members WHERE budget_id=? AND user_id=?').bind(id,memberId).first())return reply({error:'המשתתף אינו זמין.'},404);
  await DB.prepare('INSERT INTO budget_member_roles VALUES(?,?,?) ON CONFLICT(budget_id,user_id) DO UPDATE SET role=excluded.role').bind(id,memberId,body.role).run();return reply({role:body.role});
 }
 if(parts[4]==='members'&&parts[5]&&request.method==='DELETE'){
  const memberId=decodeURIComponent(parts[5]);await DB.prepare('UPDATE budget_invitations SET accepted_user=\'revoked\' WHERE budget_id=? AND accepted_user=?').bind(id,memberId).run();
  await DB.prepare('DELETE FROM budget_member_roles WHERE budget_id=? AND user_id=?').bind(id,memberId).run();
  await DB.prepare('DELETE FROM budget_members WHERE budget_id=? AND user_id=?').bind(id,memberId).run();return reply({removed:true});
 }
 if(parts[4]==='invites'&&request.method==='POST'){
  const role=body?.role??'editor';if(!['viewer','editor'].includes(role))return reply({error:'יש לבחור הרשאה תקינה.'},400);
  const invited=normalizeEmail(body?.email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invited)||invited.length>254||invited===email)return reply({error:'יש להזין כתובת אימייל של משתתף אחר.'},400);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join(''),hash=await digest(token),expires=new Date(Date.now()+7*86400000).toISOString();
  await DB.prepare('DELETE FROM budget_invitations WHERE budget_id=? AND (email=? OR expires_at<=?)').bind(id,invited,new Date().toISOString()).run();
  const r=await DB.prepare('INSERT INTO budget_invitations (hash,budget_id,email,expires_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM budget_invitations WHERE budget_id=? AND accepted_user IS NULL)<30').bind(hash,id,invited,expires,id).run();
  if(r.meta.changes)await DB.prepare('INSERT INTO budget_invitation_roles VALUES(?,?)').bind(hash,role).run();
  return r.meta.changes?reply({token,expiresAt:expires},201):reply({error:'יש יותר מדי הזמנות פתוחות. בטלו הזמנות ישנות.'},400);
 }
 if(parts[4]==='invites'&&/^[a-f0-9]{64}$/.test(parts[5]||'')&&request.method==='DELETE'){
  await DB.prepare('DELETE FROM budget_invitations WHERE hash=? AND budget_id=?').bind(parts[5],id).run();return reply({removed:true});
 }
 return reply({error:'הפעולה אינה נתמכת.'},405);
 }catch(error){console.error('Budget spaces error',error);return reply({error:'לא ניתן להשלים כרגע. הנתונים בעמוד נשארו זמינים; נסו שוב.'},503);}
}
