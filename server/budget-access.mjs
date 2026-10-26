import {budgetSpaceScope} from '../dist/server/space-model.js';
export const serviceError=(message,status=400)=>Object.assign(new Error(message),{status,safeToExpose:true});
export function budgetAccess(db,user,budget='personal',{write=false,isAllowed=()=>false}={}){
 if(!user||!isAllowed(user.email))throw serviceError('הגישה לחשבון אינה מורשית.',403);
 let row,role='owner';
 if(budget==='personal'){row=db.prepare('SELECT data,revision FROM plans WHERE user_id=?').get(user.id);}
 else{row=db.prepare('SELECT data,revision,owner_id FROM budgets WHERE id=? AND (owner_id=? OR EXISTS(SELECT 1 FROM budget_members WHERE budget_id=budgets.id AND user_id=?))').get(budget,user.id,user.id);if(!row)throw serviceError('התקציב אינו זמין לחשבון הזה.',404);if(row.owner_id!==user.id)role=db.prepare('SELECT role FROM budget_member_roles WHERE budget_id=? AND user_id=?').get(budget,user.id)?.role??'editor';}
 if(write&&role==='viewer')throw serviceError('התקציב פתוח לצפייה בלבד.',403);
 return{scope:budgetSpaceScope(user.id,budget),role,revision:row?.revision??0,plan:row?.data?JSON.parse(row.data):null};
}
export const serviceJSON=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function boundedJSON(request,max=16384){const text=await request.text();if(Buffer.byteLength(text)>max)throw serviceError('הבקשה גדולה מדי.',413);try{return JSON.parse(text);}catch{throw serviceError('הבקשה אינה תקינה.');}}
