import {loadOverview,type OverviewEntry} from './overview-api.ts'
import {loadBudgetSnapshot,AccessError,type BudgetResponse} from './budget-api.ts'
import {hydrateTransferMatchSnapshot,transferMatchRequest,openTransferMatchSource,clearTransferMatchEntries} from '../../../src/transfer-match-commands.js'
import {transferLegs} from '../../../src/transfer-matching-model.js'
import {vaultGeneration} from './vault-session.ts'
import {SaveConflict,SaveUncertain} from './plan-save.ts'
export type MatchState={user:string;asOf:string;entries:Map<string,OverviewEntry>;privateMatches:any;transferOut:string;transferIn:string}
async function matchFetch(url:string,options:RequestInit,fetcher:typeof fetch){const controller=new AbortController(),parent=options.signal,abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();const timer=setTimeout(abort,15000);try{return await fetcher(url,{...options,signal:controller.signal})}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort)}}
async function readMatches(user:string,signal:AbortSignal,fetcher:typeof fetch){const r=await matchFetch('/api/transfer-matches',{credentials:'same-origin',cache:'no-store',signal},fetcher);if([401,403,404].includes(r.status))throw new AccessError('הגישה להתאמות השתנתה.');if(!r.ok)throw Error('לא ניתן לטעון את רשימת ההתאמות. יש לרענן לפני עדכון.');const data=await r.json();if(data.accountId!==user)throw new AccessError('החשבון השתנה.');if(!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.items))throw Error('רשימת ההתאמות אינה תקינה.');return data}
export async function loadMatchState(budgetId:string,base:BudgetResponse,asOf:string,signal:AbortSignal,previous?:MatchState,fetcher:typeof fetch=fetch){
 const epoch=vaultGeneration(),result=await loadOverview({budgetId,base,asOf,signal,previous:previous?.entries??new Map(),publish:()=>{},matching:true},fetcher);if(!result||signal.aborted)return null
 const state:MatchState={user:base.accountId,asOf,entries:result.entries,privateMatches:null,transferOut:'',transferIn:''}
 try{state.privateMatches=await readMatches(base.accountId,signal,fetcher);state.privateMatches=await hydrateTransferMatchSnapshot(state);if(signal.aborted){clearTransferMatchEntries(state.entries);return null}if(epoch!==vaultGeneration())throw new AccessError('התקציב ננעל בזמן טעינת ההתאמות.');return{state,error:result.error}}catch(e){clearTransferMatchEntries(state.entries);throw e}
}
export async function unlockMatchSource(budgetId:string,base:BudgetResponse,state:MatchState,id:string,secret:string,recovery:boolean,fetcher:typeof fetch=fetch){
 const entry=state.entries.get(id);if(!entry?.matching||!['ready','locked'].includes(entry.status))throw Error('המרחב אינו זמין לפתיחה.');const epoch=vaultGeneration(),snapshot=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(snapshot.value.accountId!==state.user||snapshot.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה.')
 const response=await matchFetch('/api/plan?budget='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'},fetcher);if([401,403,404].includes(response.status))throw new AccessError('הגישה למרחב השתנתה.');if(!response.ok)throw Error('לא ניתן לבדוק את מקור המרחב.');const latest=await response.json();if(latest.accountId!==state.user||latest.accountEmail!==base.accountEmail||id!=='personal'&&latest.budget?.id!==id)throw new AccessError('החשבון או המרחב השתנו.');const opened=await openTransferMatchSource(state.user,id,entry.matching,latest,secret,recovery)
 if(epoch!==vaultGeneration())throw new AccessError('התקציב ננעל בזמן פתיחת המקור.')
 const legs=transferLegs(opened.plan,state.user,id,entry.matching.revision,state.asOf),matching={...entry.matching,key:opened.key,keys:opened.keys,status:'ready',legs:legs.slice(0,500),truncated:legs.length>500},next={...state,entries:new Map(state.entries),transferOut:'',transferIn:''};next.entries.set(id,{...entry,matching});next.privateMatches=await hydrateTransferMatchSnapshot(next);if(epoch!==vaultGeneration()){clearTransferMatchEntries(next.entries);throw new AccessError('התקציב ננעל.')}return next
}
/** Original uncertain-write convention: refresh list before another explicit action; never replay a POST automatically. */
export async function mutateMatchState(budgetId:string,base:BudgetResponse,state:MatchState,action:'transfer-save'|'transfer-delete',id:string,confirmed:boolean,fetcher:typeof fetch=fetch){
 if(!confirmed||state.user!==base.accountId)throw Error('יש לבדוק ולאשר את הפעולה.');const epoch=vaultGeneration(),snapshot=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(snapshot.value.accountId!==state.user||snapshot.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה.')
 const current=await readMatches(state.user,new AbortController().signal,fetcher);if(current.revision!==state.privateMatches?.revision)throw new SaveConflict('רשימת ההתאמות השתנתה. יש לרענן ולבדוק לפני ניסיון נוסף.')
 const body=await transferMatchRequest(state,action,id);if(epoch!==vaultGeneration())throw new AccessError('התקציב ננעל בזמן הכנת ההתאמה.')
 let r:Response,data:any;try{r=await matchFetch('/api/transfer-matches',{method:action==='transfer-save'?'POST':'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},fetcher);data=await r.json()}catch{throw new SaveUncertain('לא ניתן לאשר את השמירה. יש לרענן ולבדוק את הרשימה לפני ניסיון נוסף.')}
 if(!r.ok){if([401,403].includes(r.status))throw new AccessError('הגישה להתאמות השתנתה.');if(r.status===409)throw new SaveConflict(data.error||'המקור או רשימת ההתאמות השתנו.');throw new SaveUncertain('לא ניתן לאשר את השמירה. יש לרענן את הרשימה לפני ניסיון נוסף.')}
 if(data.accountId!==state.user||epoch!==vaultGeneration())throw new AccessError('החשבון או הנעילה השתנו בזמן השמירה.')
 if(!Number.isSafeInteger(data.revision)||data.revision!==current.revision+1||!Array.isArray(data.items))throw new SaveUncertain('לא התקבל אישור תקין. יש לרענן את הרשימה.')
 const next={...state,privateMatches:data,transferOut:'',transferIn:''};next.privateMatches=await hydrateTransferMatchSnapshot(next);if(epoch!==vaultGeneration()){clearTransferMatchEntries(next.entries);throw new AccessError('התקציב ננעל.')}return next
}
