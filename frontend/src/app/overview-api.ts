import {overviewBudgetEntry,overviewLoadFailure} from '../../../src/space-overview-model.js'
import {visibleBudgetSpaces,spaceDeviceKey} from '../../../src/space-model.js'
import {nativeVaultSession,vaultGeneration} from './vault-session.ts'
import {AccessError,type BudgetResponse,type BudgetSpace} from './budget-api.ts'
export type OverviewEntry={meta:BudgetSpace;status:string;summary:any}
export function overviewPreference(accountId:string){try{const value=JSON.parse(localStorage.getItem(spaceDeviceKey(accountId))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
export async function loadOverview(input:{budgetId:string;base:BudgetResponse;asOf:string;previous:Map<string,OverviewEntry>;signal:AbortSignal;publish:(entries:Map<string,OverviewEntry>)=>void;preference?:any},fetcher:typeof fetch=fetch){
 const {budgetId,base,asOf,previous,signal,publish}=input
 let stopped=false;const epoch=vaultGeneration()
 const read=async(url:string)=>{const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetcher(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!r.ok)throw Object.assign(Error('לא ניתן לרענן כרגע.'),{status:r.status});const data=await r.json();if(base.vault&&epoch!==vaultGeneration())throw new AccessError('התקציב ננעל בזמן הטעינה.');if(data.accountId!==base.accountId||data.accountEmail!==undefined&&data.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. יש לפתוח מחדש את התמונה הכוללת.');return data}finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}}
 let entries=new Map<string,OverviewEntry>(),error=''
 try{
  const list=await read('/api/budgets');if(!Array.isArray(list.budgets)||!list.budgets.some((m:any)=>m.id===budgetId))throw new AccessError('המרחב הפעיל אינו זמין עוד לחשבון.');if(signal.aborted)return null
  if(list.budgets.some((m:any)=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['owner','editor','viewer'].includes(m.role)))throw new AccessError('לא ניתן לאמת את רשימת המרחבים.')
  const metas=[...new Map<string,BudgetSpace>((visibleBudgetSpaces(list.budgets,input.preference??{}) as BudgetSpace[]).map(m=>[m.id,m])).values()]
  entries=new Map(metas.map(meta=>[meta.id,{meta,status:'loading',summary:previous.get(meta.id)?.summary??null}]))
  publish(new Map(entries));let index=0
  const worker=async()=>{while(!signal.aborted&&!stopped&&index<metas.length){const meta=metas[index++];try{const body=await read('/api/plan?budget='+encodeURIComponent(meta.id));if(signal.aborted||stopped)return;if(body.budget&&body.budget.id!==meta.id||meta.id!=='personal'&&body.budget?.id!==meta.id)throw new AccessError('נתוני המרחב אינם תואמים לבקשה.');const session=nativeVaultSession(budgetId,base),active={id:budgetId,loaded:true,key:session?.key,dirty:false,revision:base.revision,envelope:base.vault,plan:base.plan};entries.set(meta.id,overviewBudgetEntry(meta,body,base.accountId,asOf,active).entry as OverviewEntry)}catch(e:any){if(signal.aborted||stopped)return;if(e instanceof AccessError||e.status===401||[403,404].includes(e.status)&&meta.id===budgetId){stopped=true;throw new AccessError('החשבון או הגישה למרחב הפעיל השתנו.');}if([403,404].includes(e.status)){entries.delete(meta.id);error='הגישה לאחד המרחבים השתנתה. הנתונים שלו הוסרו.'}else entries.set(meta.id,{...(overviewLoadFailure(previous.get(meta.id),e.status)??{status:'error',summary:null}),meta})}if(!signal.aborted&&!stopped)publish(new Map(entries))}}
  await Promise.all([worker(),worker()]);if(signal.aborted)return null;return{entries,error}
 }catch(e:any){stopped=true;if(signal.aborted)return null;if(e instanceof AccessError||[401,403,404].includes(e.status)){publish(new Map());throw new AccessError('החשבון או ההרשאות השתנו. יש לפתוח מחדש.')}
  entries=new Map([...previous].map(([id,entry])=>[id,overviewLoadFailure(entry,e.status)??{meta:entry.meta,status:'error',summary:null}]));publish(entries);return{entries,error:'לא ניתן לרענן כרגע. הנתונים הקודמים נשארו מוצגים.'}
 }
}
