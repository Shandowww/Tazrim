import {cashAccountList,creditCards} from '../../../src/budget.js'
import {inboxCardLast4} from '../../../src/report-inbox-model.js'
export interface IncomingBinding {identityKey:string;kind:string;budget:string;target:string;revision:number}
export interface RoutingBudget {id:string;name:string;role:string;plan:any;locked:boolean;revision:number}
export interface RoutingCandidate {budget:string;budgetName:string;kind:string;target:string;label:string;role:string;bindingRevision?:number;budgetRevision:number}
/** Routing is stricter than the interactive report editor: no sole-account or
 * bank-name fallback, and matching runs across every accessible budget. */
export function matchIncomingReport(item:any,budgets:RoutingBudget[],bindings:IncomingBinding[]){
 const candidates:RoutingCandidate[]=[],kind=item.kind,identityKey=item.identityKey
 if(!['bank','card'].includes(kind)||!identityKey)return {state:'unknown',candidates,reason:'לא נמצא מזהה חשבון או כרטיס חד־משמעי. יש לבחור יעד לבדיקה.'}
 const last4=inboxCardLast4(item),targets=(b:RoutingBudget)=>kind==='bank'?cashAccountList(b.plan):creditCards(b.plan)
 const add=(b:RoutingBudget,target:any,bindingRevision?:number)=>candidates.push({budget:b.id,budgetName:b.name,kind,target:target.id,label:target.label??target.name,role:b.role,budgetRevision:b.revision,...(bindingRevision!==undefined?{bindingRevision}:{})})
 const validTarget=(target:any)=>kind==='bank'?(!item.provider||!target.bankName||item.provider===target.bankName):(!last4||!/^\d{4}$/.test(target.alias??'')||target.alias===last4)&&(!item.provider||!target.provider||item.provider===target.provider)
 const binding=bindings.find(row=>row.identityKey===identityKey&&row.kind===kind)
 if(binding){const b=budgets.find(b=>b.id===binding.budget);if(b&&!b.locked){const target=targets(b).find((t:any)=>t.id===binding.target&&validTarget(t));if(target)add(b,target,binding.revision)}
  return {state:candidates.length===1&&candidates[0].role!=='viewer'?'matched':'unknown',candidates,reason:candidates.length?'שיוך מזהה שאושר בעבר':'השיוך השמור אינו זמין. יש לפתוח את התקציב או לבחור יעד מורשה.'}}
 for(const b of budgets.filter(b=>!b.locked)){
  const known=(b.plan.reportInbox?.bindings??[]).filter((row:any)=>row.key===identityKey&&row.kind===kind)
  for(const row of known){const target=targets(b).find((t:any)=>t.id===row.target&&validTarget(t));if(target)add(b,target)}
 }
 if(!candidates.length&&kind==='card'&&last4&&item.provider)for(const b of budgets.filter(b=>!b.locked))for(const target of targets(b).filter((t:any)=>t.alias===last4&&t.provider===item.provider&&validTarget(t)))add(b,target)
 const unique=[...new Map(candidates.map(c=>[c.budget+'\0'+c.target,c])).values()]
 if(budgets.some(b=>b.locked))return {state:'locked',candidates:unique,reason:'יש תקציב נעול שלא ניתן לבדוק בו מזהים. יש לפתוח אותו או לאשר יעד במפורש.'}
 return {state:unique.length===1&&unique[0].role!=='viewer'?'matched':unique.length>1?'ambiguous':'unknown',candidates:unique,reason:unique.length>1?'אותו מזהה מתאים ליותר מחשבון אחד. יש לאשר את היעד.':unique.length?'החשבון זוהה לפי מזהה שמור או ספרות הכרטיס והמנפיק':'המזהה חדש. בחרו חשבון פעם אחת כדי לזכור את השיוך.'}
}
