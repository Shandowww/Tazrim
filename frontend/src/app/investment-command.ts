import {investmentDepositsFor,updateInvestmentGoal,validatePlan} from '../../../src/budget.js'
import {investmentProjection} from '../../../src/investment-model.js'
import {moneyInputCents} from './monthly-report.ts'
export interface InvestmentDraft {initial:string;monthly:string;years:string;annualReturn:string;annualIncrease:string}
export const initialInvestmentDraft=():InvestmentDraft=>({initial:'',monthly:'0',years:'20',annualReturn:'0',annualIncrease:'0'})
export function prepareInvestmentProjection(plan:any,draft:InvestmentDraft,asOf:string){
 if(!validatePlan(plan)||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(asOf)||!draft||Object.keys(draft).sort().join(',')!=='annualIncrease,annualReturn,initial,monthly,years'||Object.values(draft).some(v=>typeof v!=='string'||v.length>32))throw Error('יש לבדוק את נתוני הסימולציה.')
 if(!draft.monthly.trim())throw Error('יש להזין הפקדה חודשית; אפשר להזין אפס.')
 const numeric=(key:'years'|'annualReturn'|'annualIncrease',min:number,max:number,step:number)=>{const raw=draft[key].trim(),n=Number(raw);if(!/^-?\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(n)||n<min||n>max||!Number.isInteger(n/step))throw Error('יש לבדוק את השנים והאחוזים בסימולציה.');return n}
 const result=investmentProjection({initial:draft.initial.trim()?moneyInputCents(draft.initial)/100:investmentDepositsFor(plan,asOf),monthly:moneyInputCents(draft.monthly)/100,years:numeric('years',1,50,1),annualReturn:numeric('annualReturn',-10,20,.5),annualIncrease:numeric('annualIncrease',0,20,.5)})
 return {...result,...result.rows[result.rows.length-1]}
}
export function prepareInvestmentGoal(plan:any,draft:InvestmentDraft,asOf:string,confirmed:boolean){
 prepareInvestmentProjection(plan,draft,asOf)
 if(confirmed!==true)throw Error('יש לאשר במפורש את עדכון יעד ההשקעה בלבד.')
 return updateInvestmentGoal(plan,moneyInputCents(draft.monthly)/100)
}
