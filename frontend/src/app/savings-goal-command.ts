import {clone,savingsIllustrations,setSavingsGoalFunding,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface SavingsGoalDraft{name:string;target:string;deadline:string;icon:string;monthly:string;fundingAccountIds:string[]}
export const savingsIconLabels:Record<string,string>={house:'בית',plane:'נסיעה',armchair:'רהיטים',baby:'משפחה',trophy:'מטרה', 'party-popper':'אירוע',car:'רכב','safety-fund':'כרית ביטחון',business:'עסק'}
export function savingsGoalEligibility(plan:any,id:string,create=false){if(!validatePlan(plan))return 'התקציב אינו זמין לעריכת מטרות.';if(!plan.savingsGoals)return 'יש להגדיר תחילה את יתרת החיסכון בממשק הקיים.';if(!create&&!plan.savingsGoals.items.some((g:any)=>g.id===id))return 'המטרה אינה זמינה במרחב הזה.';return null}
export function initialSavingsGoalDraft(plan:any,id:string):SavingsGoalDraft{const g=plan.savingsGoals?.items.find((g:any)=>g.id===id);return{name:g?.name??'',target:g?String(g.target):'',deadline:g?.deadline??'',icon:g?.icon??'trophy',monthly:String(g?.monthly??0),fundingAccountIds:[...(g?.fundingAccountIds??[])]}}
export function savingsGoalDraftFingerprint(d: SavingsGoalDraft){let target:any,monthly:any;try{target=moneyInputCents(d.target)}catch{target={invalid:d.target}}try{monthly=moneyInputCents(d.monthly)}catch{monthly={invalid:d.monthly}}return JSON.stringify({...d,monthly,name:d.name.trim(),target,fundingAccountIds:[...d.fundingAccountIds].sort()})}
export function prepareSavingsGoal(plan:any,id:string,draft:SavingsGoalDraft,create=false){
 const reason=savingsGoalEligibility(plan,id,create);if(reason)throw Error(reason)
 const fields=['name','target','deadline','icon','monthly','fundingAccountIds']
 if(typeof id!=='string'||!id||id.length>100||!draft||Object.keys(draft).length!==fields.length||Object.keys(draft).some(k=>!fields.includes(k))||Object.entries(draft).some(([k,v])=>k!=='fundingAccountIds'&&(typeof v!=='string'||v.length>100))||!Array.isArray(draft.fundingAccountIds)||draft.fundingAccountIds.length>10||draft.fundingAccountIds.some(id=>typeof id!=='string'||id.length>100)||!savingsIllustrations.includes(draft.icon))throw Error('יש לבדוק את פרטי המטרה.')
 if(create&&plan.savingsGoals.items.some((g:any)=>g.id===id))throw Error('מזהה המטרה כבר קיים. אין לדרוס אותה.')
 const next=clone(plan);let goal=next.savingsGoals.items.find((g:any)=>g.id===id)
 if(!goal){goal={id,allocated:0,monthly:0};next.savingsGoals.items.push(goal)}
 Object.assign(goal,{name:draft.name.trim(),target:moneyInputCents(draft.target)/100,icon:draft.icon,monthly:moneyInputCents(draft.monthly)/100})
 if(draft.deadline)goal.deadline=draft.deadline;else delete goal.deadline
 return setSavingsGoalFunding(next,id,draft.fundingAccountIds)
}
