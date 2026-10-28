import {cashAccountList,creditCards,cashCardAccount,cashPayerCandidates,assignCashPayers,validatePlan} from '../../../src/budget.js'
export const assignmentGroups=['cards','items','loans','details','savings'] as const
export type AssignmentGroup=typeof assignmentGroups[number]
export type CashAssignmentsDraft={links:Record<AssignmentGroup,Record<string,string>>;confirmed:boolean}
export function initialCashAssignmentsDraft(plan:any):CashAssignmentsDraft{
 const eligible=cashPayerCandidates(plan)
 return{links:Object.fromEntries(assignmentGroups.map(group=>[group,Object.fromEntries((group==='cards'?creditCards(plan):eligible[group]).map((row:any)=>[row.id,group==='cards'?cashCardAccount(plan,row.id)??'':'']))])) as CashAssignmentsDraft['links'],confirmed:false}
}
export function prepareCashAssignments(plan:any,draft:CashAssignmentsDraft){
 if(!validatePlan(plan)||!draft||Object.keys(draft).sort().join(',')!=='confirmed,links'||draft.confirmed!==true||!draft.links||Object.keys(draft.links).sort().join(',')!==[...assignmentGroups].sort().join(','))throw Error('יש לבדוק ולאשר את שיוכי החשבונות.')
 const accounts=new Set(cashAccountList(plan).map((a:any)=>a.id)),eligible=cashPayerCandidates(plan)
 if(!accounts.size)throw Error('יש להגדיר תחילה חשבון במרחב הזה.')
 for(const group of assignmentGroups){const allowed=new Set((group==='cards'?creditCards(plan):eligible[group]).map((row:any)=>row.id)),values=draft.links[group];if(!values||Array.isArray(values)||typeof values!=='object'||Object.entries(values).some(([id,value])=>!allowed.has(id)||typeof value!=='string'||value!==''&&!accounts.has(value)))throw Error('יש לשייך רק פריטים זמינים לחשבונות שבמרחב הנבחר.')}
 return assignCashPayers(plan,draft.links)
}
